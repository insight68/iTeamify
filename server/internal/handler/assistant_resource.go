package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"reflect"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/internal/integrations/gmail"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

const maxAssistantResourceBody = 256 << 10

type resolvedAssistantPrincipal struct {
	assistantresource.Principal
	WorkspaceUUID      pgtype.UUID
	TaskUUID           pgtype.UUID
	AgentUUID          pgtype.UUID
	ChatSessionUUID    pgtype.UUID
	OriginatorUserUUID pgtype.UUID
	InputTaskUUID      pgtype.UUID
}

type assistantActionExecutionResponse struct {
	OperationID string                         `json:"operation_id"`
	Replayed    bool                           `json:"replayed"`
	Result      assistantresource.ActionResult `json:"result"`
}

func (h *Handler) GetAssistantResourceCatalog(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.resolveAssistantReadPrincipal(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"resources": h.AssistantResources.Discover(principal.Principal),
	})
}

func (h *Handler) DescribeAssistantResource(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.resolveAssistantReadPrincipal(w, r)
	if !ok {
		return
	}
	definition, err := h.AssistantResources.Describe(principal.Principal, chi.URLParam(r, "resource"))
	if err != nil {
		writeAssistantResourceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, definition)
}

func (h *Handler) QueryAssistantResources(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.resolveAssistantReadPrincipal(w, r)
	if !ok {
		return
	}
	var request assistantresource.QueryRequest
	if !decodeAssistantResourceBody(w, r, &request) {
		return
	}
	result, err := h.AssistantResources.Query(r.Context(), principal.Principal, request)
	if err != nil {
		writeAssistantResourceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) GetAssistantResource(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.resolveAssistantReadPrincipal(w, r)
	if !ok {
		return
	}
	resource := chi.URLParam(r, "resource")
	resourceID := chi.URLParam(r, "resourceId")
	record, err := h.AssistantResources.Get(r.Context(), principal.Principal, resource, resourceID)
	if err != nil {
		writeAssistantResourceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"resource": resource, "record": record})
}

func (h *Handler) PreviewAssistantResourceAction(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.resolveAssistantPrincipal(w, r)
	if !ok {
		return
	}
	var request assistantresource.ActionRequest
	if !decodeAssistantResourceBody(w, r, &request) {
		return
	}
	preview, err := h.AssistantResources.Preview(r.Context(), principal.Principal, request)
	if err != nil {
		writeAssistantResourceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func (h *Handler) ExecuteAssistantResourceAction(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.resolveAssistantPrincipal(w, r)
	if !ok {
		return
	}
	var request assistantresource.ActionRequest
	if !decodeAssistantResourceBody(w, r, &request) {
		return
	}
	request.IdempotencyKey = strings.TrimSpace(request.IdempotencyKey)
	if request.IdempotencyKey == "" || len(request.IdempotencyKey) > 200 {
		writeError(w, http.StatusBadRequest, "idempotency_key must contain 1 to 200 characters")
		return
	}
	existing, err := h.Queries.GetAssistantOperationByIdempotencyKey(r.Context(), db.GetAssistantOperationByIdempotencyKeyParams{
		WorkspaceID: principal.WorkspaceUUID, IdempotencyKey: request.IdempotencyKey,
	})
	if err == nil {
		h.writeAssistantOperationReplay(w, existing, request, principal)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		slog.Error("get assistant operation idempotency", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to start assistant operation")
		return
	}

	preview, err := h.AssistantResources.Preview(r.Context(), principal.Principal, request)
	if err != nil {
		writeAssistantResourceError(w, err)
		return
	}
	if preview.ConfirmationRequired && !request.Confirmed {
		writeAssistantResourceError(w, assistantresource.ErrConfirmationRequired)
		return
	}
	if preview.ConfirmationRequired && strings.TrimSpace(request.UserIntentMessageID) == "" && strings.TrimSpace(request.UserIntentSubmissionID) == "" {
		writeAssistantResourceError(w, assistantresource.ErrUserIntentRequired)
		return
	}
	if !h.validateAssistantSubmissionIntent(w, r, principal, request) || !h.validateAssistantUserIntent(w, r, principal, request.UserIntentMessageID) {
		return
	}

	encodedRequest, _ := json.Marshal(request)
	encodedPreview, _ := json.Marshal(preview)
	operation, err := h.Queries.CreateAssistantOperation(r.Context(), db.CreateAssistantOperationParams{
		WorkspaceID:         principal.WorkspaceUUID,
		ResourceType:        request.Resource,
		ResourceID:          request.ResourceID,
		Action:              request.Action,
		Risk:                string(preview.Risk),
		ConfirmationType:    string(preview.Confirmation),
		OriginatorUserID:    principal.OriginatorUserUUID,
		AgentID:             principal.AgentUUID,
		TaskID:              principal.TaskUUID,
		ChatSessionID:       principal.ChatSessionUUID,
		UserIntentMessageID: optionalAssistantUUID(request.UserIntentMessageID),
		IdempotencyKey:      request.IdempotencyKey,
		ExpectedVersion:     optionalAssistantVersion(request.ExpectedVersion),
		Request:             encodedRequest,
		Preview:             encodedPreview,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			existing, getErr := h.Queries.GetAssistantOperationByIdempotencyKey(r.Context(), db.GetAssistantOperationByIdempotencyKeyParams{
				WorkspaceID: principal.WorkspaceUUID, IdempotencyKey: request.IdempotencyKey,
			})
			if getErr == nil {
				h.writeAssistantOperationReplay(w, existing, request, principal)
				return
			}
		}
		slog.Error("create assistant operation", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to start assistant operation")
		return
	}

	result, executeErr := h.AssistantResources.Execute(r.Context(), principal.Principal, request)
	if executeErr != nil {
		_, markErr := h.Queries.FailAssistantOperation(r.Context(), db.FailAssistantOperationParams{
			ErrorCode: assistantOperationErrorCode(executeErr), ErrorMessage: executeErr.Error(),
			ID: operation.ID, WorkspaceID: principal.WorkspaceUUID,
		})
		if markErr != nil {
			slog.Error("mark assistant operation failed", "error", markErr, "operation_id", uuidToString(operation.ID))
		}
		writeAssistantResourceError(w, executeErr)
		return
	}

	encodedResult, _ := json.Marshal(result)
	completed, err := h.Queries.CompleteAssistantOperation(r.Context(), db.CompleteAssistantOperationParams{
		ResourceID: result.ResourceID, Result: encodedResult, ID: operation.ID, WorkspaceID: principal.WorkspaceUUID,
	})
	if err != nil {
		slog.Error("complete assistant operation", "error", err, "operation_id", uuidToString(operation.ID))
		writeError(w, http.StatusInternalServerError, "assistant action succeeded but its audit record could not be completed")
		return
	}
	h.publishAssistantResourceChanged(principal, result, completed)
	writeJSON(w, http.StatusOK, assistantActionExecutionResponse{
		OperationID: uuidToString(operation.ID), Result: result,
	})
}

func (h *Handler) resolveAssistantPrincipal(w http.ResponseWriter, r *http.Request) (resolvedAssistantPrincipal, bool) {
	principal, task, ok := h.resolveAssistantReadPrincipalAndTask(w, r)
	if !ok {
		return resolvedAssistantPrincipal{}, false
	}
	if !task.ChatSessionID.Valid {
		writeError(w, http.StatusForbidden, "resource actions require a human-originated Chat task")
		return resolvedAssistantPrincipal{}, false
	}
	session, err := h.Queries.GetChatSession(r.Context(), task.ChatSessionID)
	if err != nil || session.WorkspaceID != principal.WorkspaceUUID || session.AgentID != task.AgentID {
		writeError(w, http.StatusForbidden, "task cannot access resources for this Chat session")
		return resolvedAssistantPrincipal{}, false
	}
	principal.ChatSessionUUID = session.ID
	principal.Principal.ChatSessionID = uuidToString(session.ID)
	return principal, true
}

func (h *Handler) resolveAssistantReadPrincipal(w http.ResponseWriter, r *http.Request) (resolvedAssistantPrincipal, bool) {
	principal, _, ok := h.resolveAssistantReadPrincipalAndTask(w, r)
	return principal, ok
}

func (h *Handler) resolveAssistantReadPrincipalAndTask(w http.ResponseWriter, r *http.Request) (resolvedAssistantPrincipal, db.AgentTaskQueue, bool) {
	workspaceID, taskID, ok := taskActorContext(w, r)
	if !ok {
		return resolvedAssistantPrincipal{}, db.AgentTaskQueue{}, false
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskID)
	if err != nil || !task.OriginatorUserID.Valid {
		writeError(w, http.StatusForbidden, "resource tools require a human-originated task")
		return resolvedAssistantPrincipal{}, db.AgentTaskQueue{}, false
	}
	member, err := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
		UserID: task.OriginatorUserID, WorkspaceID: workspaceID,
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "task originator is no longer a workspace member")
		return resolvedAssistantPrincipal{}, db.AgentTaskQueue{}, false
	}
	inputTaskID := task.ID
	if task.ChatInputTaskID.Valid {
		inputTaskID = task.ChatInputTaskID
	}
	principal := resolvedAssistantPrincipal{
		Principal: assistantresource.Principal{
			WorkspaceID:      uuidToString(workspaceID),
			TaskID:           uuidToString(taskID),
			AgentID:          uuidToString(task.AgentID),
			OriginatorUserID: uuidToString(task.OriginatorUserID),
			Role:             member.Role,
		},
		WorkspaceUUID: workspaceID, TaskUUID: taskID, AgentUUID: task.AgentID,
		OriginatorUserUUID: task.OriginatorUserID, InputTaskUUID: inputTaskID,
	}
	return principal, task, true
}

func (h *Handler) validateAssistantUserIntent(w http.ResponseWriter, r *http.Request, principal resolvedAssistantPrincipal, rawID string) bool {
	rawID = strings.TrimSpace(rawID)
	if rawID == "" {
		return true
	}
	messageID, err := util.ParseUUID(rawID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "user_intent_message_id must be a UUID")
		return false
	}
	message, err := h.Queries.GetChatMessage(r.Context(), messageID)
	if err != nil || message.ChatSessionID != principal.ChatSessionUUID || message.TaskID != principal.InputTaskUUID || message.Role != "user" {
		writeError(w, http.StatusBadRequest, "user_intent_message_id must identify a user message in the current task input")
		return false
	}
	return true
}

func (h *Handler) writeAssistantOperationReplay(w http.ResponseWriter, operation db.AssistantOperation, request assistantresource.ActionRequest, principal resolvedAssistantPrincipal) {
	if operation.ResourceType != request.Resource || operation.Action != request.Action || operation.TaskID != principal.TaskUUID {
		writeError(w, http.StatusConflict, "idempotency_key was already used for a different assistant operation")
		return
	}
	var stored assistantresource.ActionRequest
	if err := json.Unmarshal(operation.Request, &stored); err != nil ||
		stored.ResourceID != request.ResourceID || stored.Confirmed != request.Confirmed ||
		stored.UserIntentMessageID != request.UserIntentMessageID ||
		stored.UserIntentSubmissionID != request.UserIntentSubmissionID ||
		!reflect.DeepEqual(stored.ExpectedVersion, request.ExpectedVersion) ||
		!reflect.DeepEqual(stored.Input, request.Input) {
		writeError(w, http.StatusConflict, "idempotency_key was already used with a different assistant action payload")
		return
	}
	switch operation.Status {
	case "succeeded":
		var result assistantresource.ActionResult
		if err := json.Unmarshal(operation.Result, &result); err != nil {
			writeError(w, http.StatusInternalServerError, "stored assistant operation result is invalid")
			return
		}
		writeJSON(w, http.StatusOK, assistantActionExecutionResponse{OperationID: uuidToString(operation.ID), Replayed: true, Result: result})
	case "pending":
		writeError(w, http.StatusConflict, "assistant operation with this idempotency_key is still pending")
	default:
		writeError(w, http.StatusConflict, "assistant operation with this idempotency_key previously failed; retry with a new key after reviewing the error")
	}
}

func decodeAssistantResourceBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxAssistantResourceBody)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid assistant resource request")
		return false
	}
	return true
}

func (h *Handler) publishAssistantResourceChanged(principal resolvedAssistantPrincipal, result assistantresource.ActionResult, operation db.AssistantOperation) {
	if h.Bus == nil {
		return
	}
	if result.Resource == "contract_review" {
		s, err := h.Queries.GetChatSessionInWorkspace(context.Background(), db.GetChatSessionInWorkspaceParams{ID: parseUUID(result.ResourceID), WorkspaceID: principal.WorkspaceUUID})
		if err == nil {
			review, err := h.Queries.GetContractReview(context.Background(), db.GetContractReviewParams{ID: s.ID, WorkspaceID: s.WorkspaceID})
			if err == nil {
				h.publishContractReview(s, review, "agent", principal.AgentUUID)
			}
		}
		return
	}
	payload := map[string]any{
		"workspace_id":  uuidToString(principal.WorkspaceUUID),
		"resource_type": result.Resource,
		"resource_id":   result.ResourceID,
		"action":        result.Action,
		"operation_id":  uuidToString(operation.ID),
	}
	if result.Version != nil {
		payload["version"] = *result.Version
	}
	h.Bus.Publish(events.Event{
		Type: protocol.EventResourceChanged, WorkspaceID: uuidToString(principal.WorkspaceUUID),
		ActorType: "agent", ActorID: uuidToString(principal.AgentUUID), Payload: payload,
	})
}

func writeAssistantResourceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, gmail.ErrEmailNotFound), errors.Is(err, gmail.ErrDraftConflict), errors.Is(err, gmail.ErrSendPermission), errors.Is(err, gmail.ErrInvalidDraft):
		writeOutboundEmailError(w, err)
	case errors.Is(err, gmail.ErrNotConfigured):
		writeError(w, http.StatusServiceUnavailable, "gmail integration not configured")
	case errors.Is(err, assistantresource.ErrResourceNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrContractForbidden), errors.Is(err, assistantresource.ErrForbidden):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, assistantresource.ErrConfirmationRequired), errors.Is(err, assistantresource.ErrUserIntentRequired):
		writeJSON(w, http.StatusConflict, map[string]any{"error": err.Error(), "code": "confirmation_required"})

	case errors.Is(err, service.ErrContractConflict), errors.Is(err, assistantresource.ErrVersionRequired), errors.Is(err, service.ErrBusinessConflict):
		writeJSON(w, http.StatusConflict, map[string]any{"error": err.Error(), "code": "version_conflict"})
	case errors.Is(err, service.ErrContractInput), errors.Is(err, assistantresource.ErrInvalidRequest), errors.Is(err, assistantresource.ErrActionNotFound), errors.Is(err, service.ErrBusinessProposalInvalid):
		if errors.Is(err, service.ErrBusinessProposalInvalid) {
			writeBusinessProposalInvalid(w, err)
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrBusinessInvalid), errors.Is(err, service.ErrBusinessIncomplete):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error(), "code": "validation_failed"})
	default:
		slog.Error("assistant resource operation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "assistant resource operation failed")
	}
}

func assistantOperationErrorCode(err error) string {
	switch {

	case errors.Is(err, assistantresource.ErrForbidden):
		return "forbidden"
	case errors.Is(err, assistantresource.ErrConfirmationRequired), errors.Is(err, assistantresource.ErrUserIntentRequired):
		return "confirmation_required"
	case errors.Is(err, service.ErrContractConflict), errors.Is(err, assistantresource.ErrVersionRequired), errors.Is(err, service.ErrBusinessConflict):
		return "version_conflict"
	case errors.Is(err, service.ErrContractInput), errors.Is(err, assistantresource.ErrInvalidRequest), errors.Is(err, service.ErrBusinessProposalInvalid):
		return "invalid_request"
	default:
		return "execution_failed"
	}
}

func optionalAssistantUUID(raw string) pgtype.UUID {
	if strings.TrimSpace(raw) == "" {
		return pgtype.UUID{}
	}
	parsed, err := util.ParseUUID(raw)
	if err != nil {
		return pgtype.UUID{}
	}
	return parsed
}

func optionalAssistantVersion(version *int32) pgtype.Int4 {
	if version == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *version, Valid: true}
}
