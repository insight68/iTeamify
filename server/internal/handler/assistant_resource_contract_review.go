package handler

import (
	"context"
	"fmt"
	"strings"

	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

// Task credentials can access only their own session's review, even when two
// tasks share the same originator and agent. Human metadata normalization uses
// the same participant check without granting processor actions.
func (h *Handler) assistantContractSession(ctx context.Context, p assistantresource.Principal, id string) (db.ChatSession, error) {
	wid, sid, err := parseResourceUUIDs(p.WorkspaceID, id)
	if err != nil {
		return db.ChatSession{}, err
	}
	s, err := h.Queries.GetChatSessionInWorkspace(ctx, db.GetChatSessionInWorkspaceParams{ID: sid, WorkspaceID: wid})
	if err != nil || s.ContainerType != "contract_review" {
		return db.ChatSession{}, assistantresource.ErrResourceNotFound
	}
	uid := parseUUID(p.OriginatorUserID)
	if _, err = h.Queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{WorkspaceID: wid, UserID: uid}); err != nil {
		return db.ChatSession{}, assistantresource.ErrForbidden
	}
	if p.TaskID == "" {
		if uid != s.CreatorID && (s.Kind != "direct" || uid != s.PeerUserID) {
			return db.ChatSession{}, assistantresource.ErrResourceNotFound
		}
		return s, nil
	}
	task, err := h.Queries.GetAgentTask(ctx, parseUUID(p.TaskID))
	if err != nil || task.ChatSessionID != s.ID || task.AgentID != s.AgentID || task.OriginatorUserID != s.CreatorID || uid != s.CreatorID || p.AgentID != uuidToString(s.AgentID) || s.Kind != "agent" {
		return db.ChatSession{}, assistantresource.ErrForbidden
	}
	return s, nil
}

func newContractReviewAssistantResource(h *Handler) assistantresource.Adapter {
	actions := make([]assistantresource.ActionDefinition, 0, 4)
	for _, name := range []string{"accept", "start", "request_info", "complete"} {
		actions = append(actions, assistantresource.ActionDefinition{Name: name, Description: "Apply the contract review workflow transition to the current task's review.", Risk: assistantresource.RiskLow, Confirmation: assistantresource.ConfirmationExplicit, RequiresID: true, RequiresVersion: true, AllowedRoles: allWorkspaceRoles, InputSchema: objectSchema(map[string]any{"note": map[string]any{"type": "string", "maxLength": 20000}, "result": map[string]any{"type": "string", "maxLength": 50000}}, nil)})
	}
	return handlerAssistantResourceAdapter{
		definition: assistantresource.Definition{Name: "contract_review", Version: 1, Description: "Private structured contract review bound to the current chat session. Files include authenticated download URLs; use iteamify contract-file download <file-id> --output <path> to read them locally. Status: submitted, accepted, needs_info, in_review, completed. A user request to review authorizes accept/start and saving the resulting review after preview.", ReadRoles: allWorkspaceRoles, Fields: []assistantresource.FieldDefinition{{Name: "fields", Type: "object", Sensitive: true}, {Name: "files", Type: "object[]", Sensitive: true}, {Name: "status", Type: "enum"}, {Name: "version", Type: "integer"}, {Name: "result", Type: "string", Sensitive: true}}, Actions: actions},
		get: func(ctx context.Context, p assistantresource.Principal, id string) (any, error) {
			s, err := h.assistantContractSession(ctx, p, id)
			if err != nil {
				return nil, err
			}
			return h.contractReviewResponse(ctx, s, parseUUID(p.OriginatorUserID))
		},
		preview: func(ctx context.Context, p assistantresource.Principal, req assistantresource.ActionRequest) (assistantresource.ActionPreview, error) {
			s, input, err := h.validateContractAssistantAction(ctx, p, req)
			if err != nil {
				return assistantresource.ActionPreview{}, err
			}
			review, err := h.Queries.GetContractReview(ctx, db.GetContractReviewParams{ID: s.ID, WorkspaceID: s.WorkspaceID})
			if err != nil {
				return assistantresource.ActionPreview{}, err
			}
			status, err := service.ContractReviewTransition(review.Status, input.Action, false)
			if err != nil {
				return assistantresource.ActionPreview{}, err
			}
			return assistantresource.ActionPreview{Summary: "Update the current private contract review.", Changes: []assistantresource.Change{{Field: "status", Before: review.Status, After: status}, {Field: "note", Before: review.Note, After: input.Note}, {Field: "result", Before: review.Result, After: input.Result}}}, nil
		},
		execute: func(ctx context.Context, p assistantresource.Principal, req assistantresource.ActionRequest) (assistantresource.ActionResult, error) {
			s, input, err := h.validateContractAssistantAction(ctx, p, req)
			if err != nil {
				return assistantresource.ActionResult{}, err
			}
			review, err := h.contractReviews().Update(ctx, s, parseUUID(p.AgentID), true, input, nil)
			if err != nil {
				return assistantresource.ActionResult{}, err
			}
			record, err := h.contractReviewResponse(ctx, s, parseUUID(p.OriginatorUserID))
			if err != nil {
				return assistantresource.ActionResult{}, err
			}
			return assistantresource.ActionResult{Resource: "contract_review", ResourceID: uuidToString(s.ID), Action: req.Action, Version: &review.Version, Record: record}, nil
		},
	}
}

func (h *Handler) validateContractAssistantAction(ctx context.Context, p assistantresource.Principal, req assistantresource.ActionRequest) (db.ChatSession, service.ContractReviewUpdate, error) {
	s, err := h.assistantContractSession(ctx, p, req.ResourceID)
	if err != nil {
		return s, service.ContractReviewUpdate{}, err
	}
	if p.TaskID == "" || s.Status != "active" {
		return s, service.ContractReviewUpdate{}, assistantresource.ErrForbidden
	}
	var input struct {
		Note   string `json:"note"`
		Result string `json:"result"`
	}
	if err = decodeAssistantInput(req.Input, &input); err != nil {
		return s, service.ContractReviewUpdate{}, err
	}
	if req.ExpectedVersion == nil {
		return s, service.ContractReviewUpdate{}, assistantresource.ErrVersionRequired
	}
	if len(input.Note) > 20000 || len(input.Result) > 50000 || (req.Action == "complete" && strings.TrimSpace(input.Result) == "") || (req.Action == "request_info" && strings.TrimSpace(input.Note) == "") {
		return s, service.ContractReviewUpdate{}, service.ErrContractInput
	}
	review, err := h.Queries.GetContractReview(ctx, db.GetContractReviewParams{ID: s.ID, WorkspaceID: s.WorkspaceID})
	if err != nil {
		return s, service.ContractReviewUpdate{}, err
	}
	if review.Version != *req.ExpectedVersion {
		return s, service.ContractReviewUpdate{}, service.ErrContractConflict
	}
	if _, err = service.ContractReviewTransition(review.Status, req.Action, false); err != nil {
		return s, service.ContractReviewUpdate{}, fmt.Errorf("%w: %s", service.ErrContractInput, err)
	}
	key := req.IdempotencyKey
	if key == "" {
		key = "preview"
	}
	return s, service.ContractReviewUpdate{RequestKey: key, Version: *req.ExpectedVersion, Action: req.Action, Note: input.Note, Result: input.Result}, nil
}
