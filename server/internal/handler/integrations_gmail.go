package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/iteamify-ai/iteamify/server/internal/events"
	gmail "github.com/iteamify-ai/iteamify/server/internal/integrations/gmail"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
)

type gmailConnectInitRequest struct {
	ReturnPath string `json:"return_path,omitempty"`
}

type gmailConnectInitResponse struct {
	RedirectURL string `json:"redirect_url"`
}

type gmailAnalysisRequest struct {
	Enabled bool `json:"enabled"`
}

func (h *Handler) GmailConnectInit(w http.ResponseWriter, r *http.Request) {
	if h.Gmail == nil {
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.workspaceMember(w, r, workspaceID); !ok {
		return
	}
	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return
	}
	workspaceUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}
	var request gmailConnectInitRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	redirectURL, err := h.Gmail.BeginConnect(r.Context(), userUUID, workspaceUUID, request.ReturnPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start gmail connection")
		return
	}
	writeJSON(w, http.StatusOK, gmailConnectInitResponse{RedirectURL: redirectURL})
}

func (h *Handler) GmailCallback(w http.ResponseWriter, r *http.Request) {
	if h.Gmail == nil {
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
		return
	}
	query := r.URL.Query()
	result, err := h.Gmail.CompleteOAuth(r.Context(), query.Get("state"), query.Get("code"))
	if err != nil {
		slog.Warn("gmail oauth callback failed", "error", err)
		http.Redirect(w, r, h.Gmail.CallbackRedirect(result, false), http.StatusFound)
		return
	}
	http.Redirect(w, r, h.Gmail.CallbackRedirect(result, true), http.StatusFound)
}

func (h *Handler) ListGmailConnections(w http.ResponseWriter, r *http.Request) {
	if h.Gmail == nil {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false, "analysis_configured": false, "connections": []any{}})
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.workspaceMember(w, r, workspaceID); !ok {
		return
	}
	connections, err := h.Gmail.ListConnections(r.Context(), parseUUID(userID), parseUUID(workspaceID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list gmail connections")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": true, "analysis_configured": h.Gmail.AnalysisConfigured(), "connections": connections,
	})
}

func (h *Handler) DeleteGmailConnection(w http.ResponseWriter, r *http.Request) {
	if h.Gmail == nil {
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	connectionID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "connection id")
	if !ok {
		return
	}
	if err := h.Gmail.Disconnect(r.Context(), parseUUID(userID), connectionID); err != nil {
		if errors.Is(err, gmail.ErrConnectionNotFound) {
			writeError(w, http.StatusNotFound, "gmail connection not found")
			return
		}
		writeError(w, http.StatusBadGateway, "failed to disconnect gmail")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UpdateGmailAnalysis(w http.ResponseWriter, r *http.Request) {
	if h.Gmail == nil {
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.workspaceMember(w, r, workspaceID); !ok {
		return
	}
	connectionID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "connection id")
	if !ok {
		return
	}
	var request gmailAnalysisRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.Gmail.SetAnalysisEnabled(r.Context(), parseUUID(userID), connectionID, parseUUID(workspaceID), request.Enabled); err != nil {
		if errors.Is(err, gmail.ErrConnectionNotFound) {
			writeError(w, http.StatusNotFound, "gmail connection not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update gmail analysis")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GmailPushWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Gmail == nil {
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
		return
	}
	if err := h.Gmail.VerifyPushRequest(r.Context(), r); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid gmail push authentication")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var envelope gmail.PushEnvelope
	if err := json.NewDecoder(r.Body).Decode(&envelope); err != nil {
		writeError(w, http.StatusBadRequest, "invalid gmail push body")
		return
	}
	data, err := gmail.DecodePush(envelope)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid gmail push data")
		return
	}
	if _, err := h.Gmail.EnqueuePush(r.Context(), data); err != nil {
		// A non-2xx response asks Pub/Sub to retry. The DB write is the durable
		// acknowledgement boundary; Gmail API work happens only in the worker.
		writeError(w, http.StatusServiceUnavailable, "failed to persist gmail push")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) NotifyGmailAnalysis(ctx context.Context, notification gmail.AnalysisNotification) error {
	result := notification.Result
	severity := "info"
	if result.ActionRequired {
		severity = "action_required"
	} else if result.Priority == "high" || result.Priority == "urgent" {
		severity = "attention"
	}
	title := strings.TrimSpace(notification.Subject)
	if title == "" {
		title = fmt.Sprintf("Email from %s", notification.Sender)
	}
	details, _ := json.Marshal(map[string]string{
		"connection_id":    notification.ConnectionID,
		"gmail_message_id": notification.GmailMessageID,
		"email_address":    notification.EmailAddress,
		"sender":           notification.Sender,
		"subject":          notification.Subject,
		"category":         result.Category,
		"priority":         result.Priority,
		"suggested_action": result.SuggestedAction,
	})
	item, err := h.Queries.CreateInboxItemForEvent(ctx, db.CreateInboxItemForEventParams{
		WorkspaceID:   notification.WorkspaceID,
		RecipientType: "member",
		RecipientID:   notification.RecipientID,
		Type:          "gmail_analysis",
		Severity:      severity,
		Title:         truncateInboxText(title, 500),
		Body:          pgtype.Text{String: truncateInboxText(result.Summary, 2_000), Valid: result.Summary != ""},
		ActorType:     pgtype.Text{String: "system", Valid: true},
		Details:       details,
		EventKey:      pgtype.Text{String: "gmail-analysis:" + notification.BindingID + ":" + notification.GmailMessageID, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	h.Bus.Publish(events.Event{
		Type:        protocol.EventInboxNew,
		WorkspaceID: util.UUIDToString(notification.WorkspaceID),
		ActorType:   "system",
		Payload:     map[string]any{"item": inboxToResponse(item)},
	})
	return nil
}

func truncateInboxText(value string, maximum int) string {
	runes := []rune(value)
	if len(runes) <= maximum {
		return value
	}
	return string(runes[:maximum])
}
