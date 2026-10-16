package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/iteamify-ai/iteamify/server/internal/service"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const companyContextPolicy = "Published company facts are available on demand. Retrieve only the scopes needed for this task; never treat missing facts as permission to invent them."

func (h *Handler) ensureTaskCompanyContextPinned(ctx context.Context, task *db.AgentTaskQueue, workspaceID pgtype.UUID) (*CompanyContextManifest, error) {
	displayName := ""
	if workspace, err := h.Queries.GetWorkspace(ctx, workspaceID); err == nil {
		displayName = workspace.Name
	}

	if !task.CompanyContextPinnedAt.Valid {
		var releaseID pgtype.UUID
		var releaseVersion pgtype.Int4

		// System retries and delegated children inherit the exact company
		// release chosen by their parent. Manual reruns intentionally do not:
		// they are new user actions and pin the current published release.
		for _, ancestorID := range []pgtype.UUID{task.ParentTaskID, task.DelegatedFromTaskID} {
			if !ancestorID.Valid {
				continue
			}
			ancestor, err := h.Queries.GetAgentTask(ctx, ancestorID)
			if err == nil && ancestor.CompanyContextPinnedAt.Valid {
				releaseID = ancestor.CompanyReleaseID
				releaseVersion = ancestor.CompanyReleaseVersion
				break
			}
		}

		if !releaseID.Valid && !releaseVersion.Valid && h.BusinessService != nil {
			snapshot, err := h.BusinessService.PublishedSnapshot(ctx, workspaceID)
			if err != nil {
				return nil, err
			}
			if snapshot != nil {
				parsed, err := util.ParseUUID(snapshot.ID)
				if err != nil {
					return nil, err
				}
				releaseID = parsed
				releaseVersion = pgtype.Int4{Int32: snapshot.Version, Valid: true}
			}
		}

		pinned, err := h.Queries.PinAgentTaskCompanyContext(ctx, db.PinAgentTaskCompanyContextParams{
			ID: task.ID, CompanyReleaseID: releaseID, CompanyReleaseVersion: releaseVersion,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			// Another concurrent claim/request won the pin. Reload its choice.
			pinned, err = h.Queries.GetAgentTask(ctx, task.ID)
		}
		if err != nil {
			return nil, err
		}
		*task = pinned
	}

	manifest := &CompanyContextManifest{
		Available:       task.CompanyReleaseID.Valid,
		CompanyID:       util.UUIDToString(workspaceID),
		DisplayName:     displayName,
		AvailableScopes: []string{},
		Policy:          companyContextPolicy,
	}
	if task.CompanyReleaseID.Valid {
		manifest.ReleaseID = util.UUIDToString(task.CompanyReleaseID)
		manifest.ReleaseVersion = task.CompanyReleaseVersion.Int32
		manifest.AvailableScopes = append([]string(nil), service.CompanyContextScopes...)
	}
	return manifest, nil
}

func decodeCompanyContextQuery(w http.ResponseWriter, r *http.Request) (service.CompanyContextQuery, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var query service.CompanyContextQuery
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&query); err != nil {
		writeError(w, http.StatusBadRequest, "invalid company context query")
		return service.CompanyContextQuery{}, false
	}
	return query, true
}

func (h *Handler) taskCanMaintainCompany(ctx context.Context, task db.AgentTaskQueue, workspaceID pgtype.UUID) bool {
	// Authorization follows the task's server-stamped originator, never the
	// agent owner or a caller-provided user ID. Company maintenance is an
	// owner/admin capability even though every member may read Published.
	if !task.OriginatorUserID.Valid {
		return false
	}
	member, err := h.Queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{
		UserID: task.OriginatorUserID, WorkspaceID: workspaceID,
	})
	return err == nil && roleAllowed(member.Role, "owner", "admin")
}

// QueryCurrentTaskCompanyContext projects the immutable release pinned when
// this task started. It never reads the latest release or a draft.
func (h *Handler) QueryCurrentTaskCompanyContext(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, taskID, ok := taskActorContext(w, r)
	if !ok {
		return
	}
	query, ok := decodeCompanyContextQuery(w, r)
	if !ok {
		return
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	manifest, err := h.ensureTaskCompanyContextPinned(r.Context(), &task, workspaceID)
	if err != nil {
		slog.Error("company context: pin task release", "task_id", util.UUIDToString(taskID), "error", err)
		writeBusinessError(w, err, nil)
		return
	}
	if !manifest.Available {
		slog.Info("company context retrieved",
			"workspace_id", util.UUIDToString(workspaceID),
			"task_id", util.UUIDToString(taskID),
			"agent_id", util.UUIDToString(task.AgentID),
			"scopes", query.Scopes,
			"offer_ids", query.OfferIDs,
			"audience_ids", query.AudienceIDs,
			"persona_ids", query.PersonaIDs,
			"has_query", query.Query != "",
			"result", "no_published_release",
		)
		writeJSON(w, http.StatusOK, map[string]any{
			"available": false, "company": manifest, "requested_scopes": query.Scopes,
			"reason": "no_published_company_release",
		})
		return
	}
	releaseID, err := util.ParseUUID(manifest.ReleaseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid pinned company release")
		return
	}
	release, err := svc.GetRelease(r.Context(), workspaceID, releaseID)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	projection, cacheHit, err := svc.ProjectPublishedCompanyContext(release, query)
	if err != nil {
		slog.Warn("company context retrieval rejected",
			"workspace_id", util.UUIDToString(workspaceID),
			"task_id", util.UUIDToString(taskID),
			"agent_id", util.UUIDToString(task.AgentID),
			"release_id", manifest.ReleaseID,
			"scopes", query.Scopes,
			"offer_ids", query.OfferIDs,
			"audience_ids", query.AudienceIDs,
			"persona_ids", query.PersonaIDs,
			"result", "invalid_query",
		)
		writeBusinessError(w, err, nil)
		return
	}
	encoded, _ := json.Marshal(projection)
	slog.Info("company context retrieved",
		"workspace_id", util.UUIDToString(workspaceID),
		"task_id", util.UUIDToString(taskID),
		"agent_id", util.UUIDToString(task.AgentID),
		"release_id", manifest.ReleaseID,
		"release_version", manifest.ReleaseVersion,
		"scopes", projection.RequestedScopes,
		"offer_ids", query.OfferIDs,
		"audience_ids", query.AudienceIDs,
		"persona_ids", query.PersonaIDs,
		"has_query", query.Query != "",
		"max_items", query.MaxItems,
		"truncated", projection.Truncated,
		"response_bytes", len(encoded),
		"content_hash", projection.ContentHash,
		"cache_hit", cacheHit,
		"result", "success",
	)
	writeJSON(w, http.StatusOK, map[string]any{"available": true, "company": manifest, "context": projection})
}

// QueryCurrentTaskCompanyDraft is deliberately limited to Chat tasks. It is
// the maintenance counterpart to the production retrieval endpoint and
// returns the exact draft revision required by a reviewable proposal.
func (h *Handler) QueryCurrentTaskCompanyDraft(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, taskID, ok := taskActorContext(w, r)
	if !ok {
		return
	}
	query, ok := decodeCompanyContextQuery(w, r)
	if !ok {
		return
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskID)
	if err != nil || !task.ChatSessionID.Valid || !h.taskCanMaintainCompany(r.Context(), task, workspaceID) {
		writeError(w, http.StatusForbidden, "company drafts are available only in company maintenance chats")
		return
	}
	state, err := svc.Get(r.Context(), workspaceID)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	projection, err := service.ProjectCompanyContext(service.BusinessReleaseView{
		ID: "draft", Version: state.PublishedVersion, Content: state.Draft,
	}, query)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"draft_revision":          state.DraftRevision,
		"published_version":       state.PublishedVersion,
		"has_unpublished_changes": state.HasUnpublishedChanges,
		"validation_issues":       state.ValidationIssues,
		"requested_scopes":        projection.RequestedScopes,
		"content":                 projection.Content,
		"omitted_scopes":          projection.OmittedScopes,
		"truncated":               projection.Truncated,
		"content_hash":            projection.ContentHash,
	})
}
