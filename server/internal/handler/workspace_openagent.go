package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/middleware"
	"github.com/iteamify-ai/iteamify/server/internal/openagentendpoint"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type workspaceOpenAgentConfigResponse struct {
	Configured           bool    `json:"configured"`
	Revision             int64   `json:"revision"`
	BaseURL              string  `json:"base_url"`
	Model                string  `json:"model"`
	CredentialConfigured bool    `json:"credential_configured"`
	UpdatedAt            *string `json:"updated_at"`
}
type workspaceOpenAgentConfigRequest struct {
	ExpectedRevision int64  `json:"expected_revision"`
	BaseURL          string `json:"base_url"`
	Model            string `json:"model"`
	APIKey           string `json:"api_key"`
}

func workspaceOpenAgentResponse(row db.WorkspaceOpenagentConfig) workspaceOpenAgentConfigResponse {
	updated := timestampToString(row.UpdatedAt)
	return workspaceOpenAgentConfigResponse{Configured: true, Revision: row.Revision, BaseURL: row.BaseUrl, Model: row.Model, CredentialConfigured: len(row.ApiKeyEncrypted) > 0, UpdatedAt: &updated}
}

func (h *Handler) openAgentWorkspaceActor(w http.ResponseWriter, r *http.Request, owner bool) (pgtype.UUID, pgtype.UUID, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "workspace_id")
	if !ok {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	member, ok := h.requireWorkspaceMember(w, r, uuidToString(id), "workspace not found")
	if !ok {
		return id, pgtype.UUID{}, false
	}
	if owner && member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the workspace owner can change OpenAgent configuration")
		return id, pgtype.UUID{}, false
	}
	if source := r.Header.Get("X-Actor-Source"); source == "task_token" || source == "cloud_pat" {
		writeError(w, 403, "OpenAgent settings require a human member")
		return id, pgtype.UUID{}, false
	}
	return id, member.UserID, true
}

func (h *Handler) GetWorkspaceOpenAgentConfig(w http.ResponseWriter, r *http.Request) {
	id, _, ok := h.openAgentWorkspaceActor(w, r, false)
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	row, err := h.Queries.GetWorkspaceOpenAgentConfig(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, workspaceOpenAgentConfigResponse{})
		return
	}
	if err != nil {
		writeError(w, 500, "failed to load OpenAgent configuration")
		return
	}
	writeJSON(w, 200, workspaceOpenAgentResponse(row))
}

func (h *Handler) resolveWorkspaceOpenAgentEndpoint(ctx context.Context, id pgtype.UUID, req workspaceOpenAgentConfigRequest) (OpenAgentEndpoint, error) {
	base, err := openagentendpoint.NormalizeBaseURL(req.BaseURL)
	if err != nil {
		return OpenAgentEndpoint{}, err
	}
	model := strings.TrimSpace(req.Model)
	if model == "" || len(model) > 255 || strings.ContainsAny(model, "\r\n") {
		return OpenAgentEndpoint{}, errors.New("model must be a single-line ID with 1 to 255 characters")
	}
	key := strings.TrimSpace(req.APIKey)
	if key == "" {
		row, err := h.Queries.GetWorkspaceOpenAgentConfig(ctx, id)
		if err != nil {
			return OpenAgentEndpoint{}, errors.New("api_key is required for the first configuration")
		}
		plain, err := h.OpenAgentSecretBox.Open(row.ApiKeyEncrypted)
		if err != nil {
			return OpenAgentEndpoint{}, errors.New("stored credential cannot be decrypted")
		}
		key = string(plain)
	}
	if key == "" || len(key) > 64*1024 || strings.ContainsAny(key, "\r\n") {
		return OpenAgentEndpoint{}, errors.New("api_key must be one non-empty line")
	}
	return OpenAgentEndpoint{BaseURL: base, Model: model, APIKey: key}, nil
}

func (h *Handler) readWorkspaceOpenAgentInput(w http.ResponseWriter, r *http.Request) (workspaceOpenAgentConfigRequest, bool) {
	var req workspaceOpenAgentConfigRequest
	if h.OpenAgentSecretBox == nil {
		writeError(w, 503, "OpenAgent credential encryption is not configured")
		return req, false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil || req.ExpectedRevision < 0 {
		writeError(w, 400, "invalid OpenAgent configuration")
		return req, false
	}
	return req, true
}

func (h *Handler) UpdateWorkspaceOpenAgentConfig(w http.ResponseWriter, r *http.Request) {
	id, actor, ok := h.openAgentWorkspaceActor(w, r, true)
	if !ok {
		return
	}
	req, ok := h.readWorkspaceOpenAgentInput(w, r)
	if !ok {
		return
	}
	endpoint, err := h.resolveWorkspaceOpenAgentEndpoint(r.Context(), id, req)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	encrypted, err := h.OpenAgentSecretBox.Seal([]byte(endpoint.APIKey))
	if err != nil {
		writeError(w, 500, "failed to encrypt OpenAgent credential")
		return
	}
	// Serialize with workspace deletion so a completed teardown cannot leave a config row behind.
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "failed to save OpenAgent configuration")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	if _, err = qtx.LockWorkspaceForChatSessionCreate(r.Context(), id); err != nil {
		writeError(w, 404, "workspace not found")
		return
	}
	member, err := qtx.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{WorkspaceID: id, UserID: actor})
	if err != nil || member.Role != "owner" {
		writeError(w, 403, "only the workspace owner can change OpenAgent configuration")
		return
	}
	if req.ExpectedRevision > 0 {
		if _, err = qtx.GetWorkspaceOpenAgentConfig(r.Context(), id); err != nil {
			writeError(w, 409, "OpenAgent configuration changed; reload before saving")
			return
		}
	}
	row, err := qtx.UpsertWorkspaceOpenAgentConfig(r.Context(), db.UpsertWorkspaceOpenAgentConfigParams{WorkspaceID: id, BaseUrl: endpoint.BaseURL, Model: endpoint.Model, ApiKeyEncrypted: encrypted, UpdatedBy: actor, ExpectedRevision: req.ExpectedRevision})
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 409, "OpenAgent configuration changed; reload before saving")
		return
	}
	if err != nil {
		writeError(w, 500, "failed to save OpenAgent configuration")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "failed to save OpenAgent configuration")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, workspaceOpenAgentResponse(row))
}

func (h *Handler) TestWorkspaceOpenAgentConfig(w http.ResponseWriter, r *http.Request) {
	id, _, ok := h.openAgentWorkspaceActor(w, r, true)
	if !ok {
		return
	}
	req, ok := h.readWorkspaceOpenAgentInput(w, r)
	if !ok {
		return
	}
	endpoint, err := h.resolveWorkspaceOpenAgentEndpoint(r.Context(), id, req)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	tester := h.OpenAgentEndpointTester
	if tester == nil {
		tester = liveOpenAgentEndpointTester{}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	w.Header().Set("Cache-Control", "no-store")
	if err = tester.Test(ctx, endpoint); err != nil {
		// A failed probe is a completed test with a negative result. Do not
		// turn an expected configuration/network outcome into an API outage.
		result := openAgentProbeFailure(err)
		slog.Warn("OpenAgent connection test failed", "workspace_id", uuidToString(id), "reason", result.Code, "upstream_status", result.UpstreamStatus)
		writeJSON(w, http.StatusOK, result)
		return
	}
	writeJSON(w, http.StatusOK, openAgentProbeResult{OK: true})
}

func (h *Handler) GetDaemonWorkspaceOpenAgentConfig(w http.ResponseWriter, r *http.Request) {
	if middleware.DaemonAuthPathFromContext(r.Context()) != middleware.DaemonAuthPathManaged {
		writeError(w, 403, "OpenAgent credentials require the shared daemon identity")
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "workspace_id")
	if !ok {
		return
	}
	if !h.requireDaemonWorkspaceAccess(w, r, uuidToString(id)) {
		return
	}
	if h.OpenAgentSecretBox == nil {
		writeError(w, 503, "OpenAgent credential encryption is not configured")
		return
	}
	row, err := h.Queries.GetWorkspaceOpenAgentConfig(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		w.WriteHeader(204)
		return
	}
	if err != nil {
		writeError(w, 500, "failed to load OpenAgent configuration")
		return
	}
	plain, err := h.OpenAgentSecretBox.Open(row.ApiKeyEncrypted)
	if err != nil {
		writeError(w, 500, "failed to decrypt OpenAgent credential")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"provider": "anthropic", "base_url": row.BaseUrl, "model": row.Model, "api_key": string(plain)})
}
