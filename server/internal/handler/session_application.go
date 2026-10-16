package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

type SessionApplicationResponse struct {
	ID         string                            `json:"id"`
	Type       string                            `json:"type"`
	TargetKind string                            `json:"target_kind"`
	TargetID   string                            `json:"target_id"`
	TargetName string                            `json:"target_name"`
	Status     string                            `json:"status"`
	Version    int32                             `json:"version"`
	Config     service.ContractApplicationConfig `json:"config"`
	Available  bool                              `json:"available"`
	UpdatedAt  string                            `json:"updated_at"`
}

func (h *Handler) applicationTarget(ctx context.Context, wid, uid pgtype.UUID, kind string, id pgtype.UUID, requireReview bool) (string, bool, error) {
	switch kind {
	case "member":
		members, err := h.Queries.ListMembersWithUser(ctx, wid)
		if err != nil {
			return "", false, err
		}
		for _, m := range members {
			if m.UserID == id {
				return m.UserName, uid != id, nil
			}
		}
		return "", false, nil
	case "agent":
		a, err := h.Queries.GetAgentInWorkspace(ctx, db.GetAgentInWorkspaceParams{ID: id, WorkspaceID: wid})
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		if err != nil {
			return "", false, err
		}
		canContact := !a.ArchivedAt.Valid && h.canInvokeAgent(ctx, a, "member", uuidToString(uid), uuidToString(uid), uuidToString(wid))
		if !requireReview {
			return a.Name, canContact, nil
		}
		ready, err := service.ContractRuntimeSupportsFiles(ctx, h.Queries, a.RuntimeID)
		if err != nil {
			return "", false, err
		}
		return a.Name, canContact && ready, nil
	default:
		return "", false, service.ErrContractInput
	}
}
func applicationResponse(row db.SessionApplication, name string, available, private bool) (SessionApplicationResponse, error) {
	resp := SessionApplicationResponse{ID: uuidToString(row.ID), Type: row.ApplicationType, TargetKind: row.TargetKind, TargetID: uuidToString(row.TargetID), TargetName: name, Status: row.Status, Version: row.Version, Available: available, UpdatedAt: timestampToString(row.UpdatedAt)}
	if err := json.Unmarshal(row.Config, &resp.Config); err != nil {
		return resp, err
	}
	if !private {
		resp.Config.ReviewInstructions = ""
		resp.Config.ResultRequirements = ""
		resp.Config.AgentInstructions = ""
	}
	return resp, nil
}
func (h *Handler) ListSessionApplications(w http.ResponseWriter, r *http.Request) {
	wid, uid, member, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	rows, err := h.Queries.ListSessionApplications(r.Context(), wid)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	providers := []SessionApplicationResponse{}
	configs := []SessionApplicationResponse{}
	admin := roleAllowed(member.Role, "owner", "admin")
	targetKind, targetID := r.URL.Query().Get("target_kind"), r.URL.Query().Get("target_id")
	if targetID != "" {
		id, valid := parseUUIDOrBadRequest(w, targetID, "target_id")
		if !valid {
			return
		}
		_, available, targetErr := h.applicationTarget(r.Context(), wid, uid, targetKind, id, false)
		if targetErr != nil {
			contractReviewError(w, targetErr)
			return
		}
		if !available {
			writeError(w, 403, "target is unavailable")
			return
		}
	}
	for _, row := range rows {
		name, available, targetErr := h.applicationTarget(r.Context(), wid, uid, row.TargetKind, row.TargetID, true)
		if targetErr != nil {
			contractReviewError(w, targetErr)
			return
		}
		if targetID != "" && (targetKind != row.TargetKind || targetID != uuidToString(row.TargetID)) {
			continue
		}
		if row.Status == "enabled" && available {
			resp, e := applicationResponse(row, name, true, false)
			if e != nil {
				contractReviewError(w, e)
				return
			}
			providers = append(providers, resp)
		}
		own := row.TargetKind == "member" && row.TargetID == uid
		if row.TargetKind == "agent" {
			a, e := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{ID: row.TargetID, WorkspaceID: wid})
			own = e == nil && a.OwnerID == uid
		}
		if targetID == "" && (admin || own) {
			resp, e := applicationResponse(row, name, available, true)
			if e != nil {
				contractReviewError(w, e)
				return
			}
			configs = append(configs, resp)
		}
	}
	writeJSON(w, 200, map[string]any{"applications": []string{"conversation", "contract_review", "projects"}, "can_manage": admin, "providers": providers, "configurations": configs})
}

func (h *Handler) SaveSessionApplication(w http.ResponseWriter, r *http.Request) {
	wid, uid, member, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	if !roleAllowed(member.Role, "owner", "admin") {
		writeError(w, 403, "only workspace administrators can configure applications")
		return
	}
	var in service.SessionApplicationWrite
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 60<<10))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&in) != nil || (in.Status != "draft" && in.Status != "enabled" && in.Status != "paused") {
		writeError(w, 400, "invalid application configuration")
		return
	}
	if err := in.Config.Validate(); err != nil {
		contractReviewError(w, err)
		return
	}
	target, ok := parseUUIDOrBadRequest(w, in.TargetID, "target_id")
	if !ok {
		return
	}
	id := pgtype.UUID{Bytes: uuid.New(), Valid: true}
	creating := chi.URLParam(r, "applicationId") == ""
	if !creating {
		id, ok = parseUUIDOrBadRequest(w, chi.URLParam(r, "applicationId"), "application_id")
		if !ok {
			return
		}
	}
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		contractReviewError(w, err)
		return
	}
	defer tx.Rollback(context.WithoutCancel(r.Context()))
	q := h.Queries.WithTx(tx)
	// Serialize target setup with submissions and membership cleanup.
	if _, err = q.LockWorkspaceForChatSessionCreate(r.Context(), wid); err != nil {
		contractReviewError(w, err)
		return
	}
	actor, e := q.LockApplicationManager(r.Context(), db.LockApplicationManagerParams{WorkspaceID: wid, UserID: uid})
	if e != nil || !roleAllowed(actor.Role, "owner", "admin") {
		writeError(w, 403, "configuration permission changed")
		return
	}
	if in.TargetKind == "member" {
		_, err = q.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{WorkspaceID: wid, UserID: target})
	} else if in.TargetKind == "agent" {
		var a db.Agent
		a, err = q.LockContainerAgent(r.Context(), db.LockContainerAgentParams{ID: target, WorkspaceID: wid})
		if err == nil && in.Status == "enabled" && !a.RuntimeID.Valid {
			err = service.ErrContractInput
		}
		if err == nil && in.Status == "enabled" {
			var ready bool
			ready, err = service.ContractRuntimeSupportsFiles(r.Context(), q, a.RuntimeID)
			if err == nil && !ready {
				writeError(w, 400, "this AI runtime cannot read private contract files; choose a runtime with the contract-file download capability")
				return
			}
		}
	} else {
		err = service.ErrContractInput
	}
	if err != nil {
		contractReviewError(w, err)
		return
	}
	config, _ := json.Marshal(in.Config)
	var row db.SessionApplication
	if creating {
		row, err = q.CreateSessionApplication(r.Context(), db.CreateSessionApplicationParams{ID: id, WorkspaceID: wid, ApplicationType: "contract_review", TargetKind: in.TargetKind, TargetID: target, Status: in.Status, Config: config, UpdatedBy: uid})
	} else {
		var current db.SessionApplication
		current, err = q.LockSessionApplication(r.Context(), db.LockSessionApplicationParams{ID: id, WorkspaceID: wid})
		if err != nil {
			contractReviewError(w, err)
			return
		}
		if current.TargetKind != in.TargetKind || current.TargetID != target || current.Version != in.Version || (current.Status != "draft" && in.Status == "draft") {
			contractReviewError(w, service.ErrContractConflict)
			return
		}
		row, err = q.UpdateSessionApplication(r.Context(), db.UpdateSessionApplicationParams{ID: id, WorkspaceID: wid, ExpectedVersion: in.Version, Status: in.Status, Config: config, UpdatedBy: uid})
	}
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			err = service.ErrContractConflict
		}
		contractReviewError(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		contractReviewError(w, err)
		return
	}
	h.publishSessionApplication(wid, uid, id)
	name, available, _ := h.applicationTarget(r.Context(), wid, uid, row.TargetKind, row.TargetID, true)
	resp, err := applicationResponse(row, name, available, true)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	writeJSON(w, 200, resp)
}
func (h *Handler) DeleteSessionApplication(w http.ResponseWriter, r *http.Request) {
	wid, uid, m, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	if !roleAllowed(m.Role, "owner", "admin") {
		writeError(w, 403, "only administrators can delete draft configurations")
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "applicationId"), "application_id")
	if !ok {
		return
	}
	var in struct {
		Version int32 `json:"version"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in) != nil {
		writeError(w, 400, "invalid version")
		return
	}
	n, err := h.Queries.DeleteDraftSessionApplication(r.Context(), db.DeleteDraftSessionApplicationParams{ID: id, WorkspaceID: wid, Version: in.Version})
	if err != nil {
		contractReviewError(w, err)
		return
	}
	if n != 1 {
		contractReviewError(w, service.ErrContractConflict)
		return
	}
	h.publishSessionApplication(wid, uid, id)
	w.WriteHeader(204)
}
func (h *Handler) publishSessionApplication(wid, uid, id pgtype.UUID) {
	h.Bus.Publish(events.Event{Type: protocol.EventResourceChanged, WorkspaceID: uuidToString(wid), ActorType: "member", ActorID: uuidToString(uid), Payload: map[string]any{"workspace_id": uuidToString(wid), "resource_type": "session_application", "resource_id": uuidToString(id)}})
}
