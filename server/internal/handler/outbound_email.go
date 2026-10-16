package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/integrations/gmail"
	"github.com/jackc/pgx/v5"
)

func (h *Handler) outboundEmailScope(w http.ResponseWriter, r *http.Request) (gmail.OutboundScope, bool) {
	var p gmail.OutboundScope
	if h.Gmail == nil {
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
		return p, false
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return p, false
	}
	p.UserID, ok = parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return p, false
	}
	workspaceID := h.resolveWorkspaceID(r)
	p.WorkspaceID, ok = parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return p, false
	}
	if _, ok := h.workspaceMember(w, r, workspaceID); !ok {
		return p, false
	}
	return p, true
}

func writeOutboundEmailError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows), errors.Is(err, gmail.ErrEmailNotFound):
		writeError(w, http.StatusNotFound, "email or source not found")
	case errors.Is(err, gmail.ErrDraftConflict):
		writeError(w, http.StatusConflict, "email draft changed; reload before sending")
	case errors.Is(err, gmail.ErrSendPermission):
		writeError(w, http.StatusForbidden, "gmail read and send permissions required")
	case errors.Is(err, gmail.ErrInvalidDraft):
		writeError(w, http.StatusBadRequest, "invalid email recipients, content, or attachments")
	default:
		writeError(w, http.StatusInternalServerError, "failed to process email")
	}
}

func (h *Handler) ListOutboundEmails(w http.ResponseWriter, r *http.Request) {
	// An unconfigured provider behaves like an empty collection in Chat.
	if h.Gmail == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	p, ok := h.outboundEmailScope(w, r)
	if !ok {
		return
	}
	if value := r.URL.Query().Get("chat_session_id"); value != "" {
		p.ChatSessionID, ok = parseUUIDOrBadRequest(w, value, "chat session id")
		if !ok {
			return
		}
	}
	rows, err := h.Gmail.ListEmails(r.Context(), p)
	if err != nil {
		writeOutboundEmailError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *Handler) UpdateOutboundEmail(w http.ResponseWriter, r *http.Request) {
	p, ok := h.outboundEmailScope(w, r)
	if !ok {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "email id")
	if !ok {
		return
	}
	var request struct {
		gmail.EmailDraft
		ExpectedVersion int32 `json:"expected_version"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil || request.ExpectedVersion < 1 {
		writeError(w, http.StatusBadRequest, "invalid email draft")
		return
	}
	current, err := h.Gmail.GetEmail(r.Context(), p, id)
	if err != nil {
		writeOutboundEmailError(w, err)
		return
	}
	p.ChatSessionID, ok = parseUUIDOrBadRequest(w, current.ChatSessionID, "chat session id")
	if !ok {
		return
	}
	row, err := h.Gmail.SaveEmailDraft(r.Context(), p, id, request.ExpectedVersion, request.EmailDraft, false)
	if err != nil {
		writeOutboundEmailError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (h *Handler) SendOutboundEmail(w http.ResponseWriter, r *http.Request) {
	p, ok := h.outboundEmailScope(w, r)
	if !ok {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "email id")
	if !ok {
		return
	}
	var request struct {
		ExpectedVersion int32 `json:"expected_version"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil || request.ExpectedVersion < 1 {
		writeError(w, http.StatusBadRequest, "expected version required")
		return
	}
	row, err := h.Gmail.QueueEmail(r.Context(), p, id, request.ExpectedVersion)
	if err != nil {
		writeOutboundEmailError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, row)
}
