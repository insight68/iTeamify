package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

const maxChatContextResources = 20

type ChatContextResourceResponse struct {
	ID              string `json:"id"`
	ResourceType    string `json:"resource_type"`
	ResourceID      string `json:"resource_id"`
	ResourceVersion *int32 `json:"resource_version,omitempty"`
	Label           string `json:"label,omitempty"`
	Source          string `json:"source"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type UpsertChatContextResourceRequest struct {
	ResourceType    string `json:"resource_type"`
	ResourceID      string `json:"resource_id"`
	ResourceVersion *int32 `json:"resource_version,omitempty"`
	Label           string `json:"label,omitempty"`
	Source          string `json:"source,omitempty"`
}

// ListChatContextResources returns the business records explicitly selected
// for this conversation. The selection is session metadata, not chat history.
func (h *Handler) ListChatContextResources(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	session, ok := h.loadChatSessionForUser(w, r, userID, workspaceID, chi.URLParam(r, "sessionId"))
	if !ok {
		return
	}
	rows, err := h.Queries.ListChatContextResources(r.Context(), db.ListChatContextResourcesParams{
		WorkspaceID: session.WorkspaceID, ChatSessionID: session.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list chat context resources")
		return
	}
	response := make([]ChatContextResourceResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, chatContextResourceToResponse(row))
	}
	writeJSON(w, http.StatusOK, response)
}

// UpsertChatContextResource attaches a registry-backed business record to a
// conversation. The server revalidates membership and record visibility
// instead of trusting metadata supplied by a page.
func (h *Handler) UpsertChatContextResource(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	session, ok := h.loadChatSessionForUser(w, r, userID, workspaceID, chi.URLParam(r, "sessionId"))
	if !ok {
		return
	}
	member, err := h.getWorkspaceMember(r.Context(), userID, workspaceID)
	if err != nil {
		writeError(w, http.StatusForbidden, "not a workspace member")
		return
	}

	var request UpsertChatContextResourceRequest
	if !decodeAssistantResourceBody(w, r, &request) {
		return
	}
	request, err = h.normalizeChatContextResource(r.Context(), workspaceID, userID, member.Role, request)
	if err != nil {
		writeAssistantResourceError(w, err)
		return
	}

	rows, err := h.Queries.ListChatContextResources(r.Context(), db.ListChatContextResourcesParams{
		WorkspaceID: session.WorkspaceID, ChatSessionID: session.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to inspect chat context resources")
		return
	}
	alreadyAttached := false
	for _, row := range rows {
		if row.ResourceType == request.ResourceType && row.ResourceID == request.ResourceID {
			alreadyAttached = true
			break
		}
	}
	if !alreadyAttached && len(rows) >= maxChatContextResources {
		writeError(w, http.StatusConflict, "a chat session can have at most 20 context resources")
		return
	}

	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return
	}
	stored, err := h.Queries.UpsertChatContextResource(r.Context(), db.UpsertChatContextResourceParams{
		WorkspaceID: session.WorkspaceID, ChatSessionID: session.ID,
		ResourceType: request.ResourceType, ResourceID: request.ResourceID,
		ResourceVersion: ptrToInt4(request.ResourceVersion), Label: request.Label,
		Source: request.Source, CreatedByUserID: userUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to attach chat context resource")
		return
	}
	writeJSON(w, http.StatusOK, chatContextResourceToResponse(stored))
}

func (h *Handler) normalizeChatContextResource(
	ctx context.Context,
	workspaceID string,
	userID string,
	role string,
	request UpsertChatContextResourceRequest,
) (UpsertChatContextResourceRequest, error) {
	request.ResourceType = strings.TrimSpace(request.ResourceType)
	request.ResourceID = strings.TrimSpace(request.ResourceID)
	request.Label = strings.TrimSpace(request.Label)
	request.Source = strings.TrimSpace(request.Source)
	if request.ResourceType == "company_profile" && request.ResourceID == "" {
		request.ResourceID = "current"
	}
	if request.ResourceType == "" || request.ResourceID == "" || len(request.ResourceType) > 100 || len(request.ResourceID) > 200 {
		return request, fmt.Errorf("%w: resource_type and resource_id are required", assistantresource.ErrInvalidRequest)
	}
	if len(request.Label) > 200 {
		return request, fmt.Errorf("%w: label must be at most 200 characters", assistantresource.ErrInvalidRequest)
	}
	if request.ResourceVersion != nil && *request.ResourceVersion < 0 {
		return request, fmt.Errorf("%w: resource_version cannot be negative", assistantresource.ErrInvalidRequest)
	}
	if request.Source == "" {
		request.Source = "page"
	}
	if request.Source != "page" && request.Source != "user" {
		return request, fmt.Errorf("%w: source must be page or user", assistantresource.ErrInvalidRequest)
	}

	principal := assistantresource.Principal{WorkspaceID: workspaceID, OriginatorUserID: userID, Role: role}
	if _, err := h.AssistantResources.Describe(principal, request.ResourceType); err != nil {
		return request, err
	}
	record, err := h.AssistantResources.Get(ctx, principal, request.ResourceType, request.ResourceID)
	if err != nil {
		return request, err
	}
	if request.ResourceVersion == nil {
		request.ResourceVersion = inferAssistantResourceVersion(record)
	}
	if request.Label == "" {
		request.Label = inferAssistantResourceLabel(record, request.ResourceType, request.ResourceID)
	}
	return request, nil
}

func (h *Handler) DeleteChatContextResource(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	session, ok := h.loadChatSessionForUser(w, r, userID, workspaceID, chi.URLParam(r, "sessionId"))
	if !ok {
		return
	}
	contextID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "contextId"), "context resource id")
	if !ok {
		return
	}
	if session.ContainerResourceID.Valid {
		rows, err := h.Queries.ListChatContextResources(r.Context(), db.ListChatContextResourcesParams{WorkspaceID: session.WorkspaceID, ChatSessionID: session.ID})
		if err != nil {
			writeError(w, 500, "failed to inspect session context")
			return
		}
		for _, row := range rows {
			if row.ID == contextID && row.ResourceType == session.ContainerResourceType.String && row.ResourceID == uuidToString(session.ContainerResourceID) {
				writeError(w, 409, "the session's primary resource cannot be removed")
				return
			}
		}
	}
	deleted, err := h.Queries.DeleteChatContextResource(r.Context(), db.DeleteChatContextResourceParams{
		ID: contextID, WorkspaceID: session.WorkspaceID, ChatSessionID: session.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove chat context resource")
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "chat context resource not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func chatContextResourceToResponse(row db.ChatContextResource) ChatContextResourceResponse {
	return ChatContextResourceResponse{
		ID: uuidToString(row.ID), ResourceType: row.ResourceType, ResourceID: row.ResourceID,
		ResourceVersion: int4ToPtr(row.ResourceVersion), Label: row.Label, Source: row.Source,
		CreatedAt: timestampToString(row.CreatedAt), UpdatedAt: timestampToString(row.UpdatedAt),
	}
}

func inferAssistantResourceVersion(record any) *int32 {
	fields := assistantResourceRecordFields(record)
	for _, name := range []string{"version", "draft_revision"} {
		if value, ok := fields[name].(float64); ok && value >= 0 {
			version := int32(value)
			return &version
		}
	}
	return nil
}

func inferAssistantResourceLabel(record any, resourceType, resourceID string) string {
	fields := assistantResourceRecordFields(record)
	for _, name := range []string{"display_name", "company_name", "title", "quote_no", "order_no"} {
		if value, ok := fields[name].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return resourceType + ":" + resourceID
}

func assistantResourceRecordFields(record any) map[string]any {
	encoded, err := json.Marshal(record)
	if err != nil {
		return nil
	}
	var fields map[string]any
	if json.Unmarshal(encoded, &fields) != nil {
		return nil
	}
	return fields
}
