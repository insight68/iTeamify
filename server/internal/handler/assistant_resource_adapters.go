package handler

import (
	"context"
	"encoding/json"

	"fmt"
	"strings"

	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	"github.com/iteamify-ai/iteamify/server/internal/util"

	"github.com/jackc/pgx/v5/pgtype"
)

var allWorkspaceRoles = []string{"owner", "admin", "member"}

type handlerAssistantResourceAdapter struct {
	definition assistantresource.Definition
	query      func(context.Context, assistantresource.Principal, assistantresource.QueryRequest) (assistantresource.QueryResult, error)
	get        func(context.Context, assistantresource.Principal, string) (any, error)
	preview    func(context.Context, assistantresource.Principal, assistantresource.ActionRequest) (assistantresource.ActionPreview, error)
	execute    func(context.Context, assistantresource.Principal, assistantresource.ActionRequest) (assistantresource.ActionResult, error)
}

func (a handlerAssistantResourceAdapter) Definition() assistantresource.Definition {
	return a.definition
}

func (a handlerAssistantResourceAdapter) Query(ctx context.Context, principal assistantresource.Principal, request assistantresource.QueryRequest) (assistantresource.QueryResult, error) {
	if a.query == nil {
		return assistantresource.QueryResult{}, assistantresource.ErrInvalidRequest
	}
	return a.query(ctx, principal, request)
}

func (a handlerAssistantResourceAdapter) Get(ctx context.Context, principal assistantresource.Principal, id string) (any, error) {
	if a.get == nil {
		return nil, assistantresource.ErrInvalidRequest
	}
	return a.get(ctx, principal, id)
}

func (a handlerAssistantResourceAdapter) Preview(ctx context.Context, principal assistantresource.Principal, request assistantresource.ActionRequest) (assistantresource.ActionPreview, error) {
	if a.preview == nil {
		return assistantresource.ActionPreview{}, assistantresource.ErrActionNotFound
	}
	return a.preview(ctx, principal, request)
}

func (a handlerAssistantResourceAdapter) Execute(ctx context.Context, principal assistantresource.Principal, request assistantresource.ActionRequest) (assistantresource.ActionResult, error) {
	if a.execute == nil {
		return assistantresource.ActionResult{}, assistantresource.ErrActionNotFound
	}
	return a.execute(ctx, principal, request)
}

func newAssistantResourceRegistry(h *Handler) *assistantresource.Registry {
	registry := assistantresource.New()
	for _, adapter := range []assistantresource.Adapter{
		newContractReviewAssistantResource(h),
		newCompanyProfileAssistantResource(h),
		newGmailConnectionAssistantResource(h),
		newOutboundEmailAssistantResource(h),
	} {
		if err := registry.Register(adapter); err != nil {
			panic(fmt.Sprintf("register assistant resource: %v", err))
		}
	}
	return registry
}

func newCompanyProfileAssistantResource(h *Handler) assistantresource.Adapter {
	return handlerAssistantResourceAdapter{
		definition: assistantresource.Definition{
			Name: "company_profile", Version: 1,
			Description: "The workspace's live company identity, positioning, offers, audiences, proof, and operating boundaries.",
			ReadRoles:   allWorkspaceRoles, MaxPageSize: 1,
			Fields: []assistantresource.FieldDefinition{
				{Name: "draft_revision", Type: "integer"},
				{Name: "published_version", Type: "integer"},
				{Name: "draft", Type: "object", Writable: true},
				{Name: "published", Type: "object"},
			},
			Actions: []assistantresource.ActionDefinition{{
				Name: "update", Description: "Apply confirmed top-level company profile replacements. Collection paths require the complete array; add does not append one item.",
				Risk: assistantresource.RiskMedium, Confirmation: assistantresource.ConfirmationExplicit,
				RequiresID: false, RequiresVersion: true, AllowedRoles: []string{"owner", "admin"},
				InputSchema: businessProfileUpdateInputSchema(),
			}},
		},
		query: func(ctx context.Context, principal assistantresource.Principal, _ assistantresource.QueryRequest) (assistantresource.QueryResult, error) {
			workspaceID, err := util.ParseUUID(principal.WorkspaceID)
			if err != nil {
				return assistantresource.QueryResult{}, assistantresource.ErrForbidden
			}
			state, err := h.BusinessService.Get(ctx, workspaceID)
			if err != nil {
				return assistantresource.QueryResult{}, err
			}
			return assistantresource.QueryResult{Resource: "company_profile", Rows: []any{state}, Count: 1, Total: 1}, nil
		},
		get: func(ctx context.Context, principal assistantresource.Principal, id string) (any, error) {
			if id != "" && id != "current" {
				return nil, fmt.Errorf("%w: company_profile uses resource_id=current", assistantresource.ErrInvalidRequest)
			}
			workspaceID, err := util.ParseUUID(principal.WorkspaceID)
			if err != nil {
				return nil, assistantresource.ErrForbidden
			}
			return h.BusinessService.Get(ctx, workspaceID)
		},
		preview: func(ctx context.Context, principal assistantresource.Principal, request assistantresource.ActionRequest) (assistantresource.ActionPreview, error) {
			input, err := businessAssistantInput(request)
			if err != nil {
				return assistantresource.ActionPreview{}, err
			}
			workspaceID, err := util.ParseUUID(principal.WorkspaceID)
			if err != nil {
				return assistantresource.ActionPreview{}, assistantresource.ErrForbidden
			}
			state, next, err := h.BusinessService.PreviewProfileUpdate(ctx, workspaceID, input)
			if err != nil {
				return assistantresource.ActionPreview{}, err
			}
			changes := businessAssistantChanges(state.Draft, next, input.Operations)
			return assistantresource.ActionPreview{Summary: input.Title, Changes: changes}, nil
		},
		execute: func(ctx context.Context, principal assistantresource.Principal, request assistantresource.ActionRequest) (assistantresource.ActionResult, error) {
			input, err := businessAssistantInput(request)
			if err != nil {
				return assistantresource.ActionResult{}, err
			}
			workspaceID, err := util.ParseUUID(principal.WorkspaceID)
			if err != nil {
				return assistantresource.ActionResult{}, assistantresource.ErrForbidden
			}
			userID, err := util.ParseUUID(principal.OriginatorUserID)
			if err != nil {
				return assistantresource.ActionResult{}, assistantresource.ErrForbidden
			}
			state, err := h.BusinessService.UpdateProfile(ctx, workspaceID, userID, input)
			if err != nil {
				return assistantresource.ActionResult{}, err
			}
			version := state.DraftRevision
			return assistantresource.ActionResult{Resource: "company_profile", ResourceID: "current", Action: request.Action, Version: &version, Record: state}, nil
		},
	}
}

func businessAssistantChanges(before, after service.BusinessContent, operations []service.BusinessChangeOperation) []assistantresource.Change {
	beforeFields := mapFromJSON(before)
	afterFields := mapFromJSON(after)
	changes := make([]assistantresource.Change, 0, len(operations))
	for _, operation := range operations {
		key := strings.TrimPrefix(operation.Path, "/")
		changes = append(changes, assistantresource.Change{
			Field:  operation.Path,
			Before: beforeFields[key],
			After:  afterFields[key],
		})
	}
	return changes
}

func businessProfileUpdateInputSchema() map[string]any {
	return objectSchema(map[string]any{
		"title":     map[string]any{"type": "string", "minLength": 1, "maxLength": 240},
		"rationale": map[string]any{"type": "string"},
		"operations": map[string]any{
			"type":     "array",
			"minItems": 1,
			"maxItems": 32,
			"items":    service.BusinessOperationJSONSchema(),
		},
		"source_refs": map[string]any{"type": "array", "items": map[string]any{"type": "object"}},
	}, []string{"title", "operations"})
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	schema := map[string]any{"type": "object", "additionalProperties": false, "properties": properties}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func stringFilter(filters map[string]any, name string) (string, error) {
	if len(filters) == 0 {
		return "", nil
	}
	value, ok := filters[name]
	if !ok || value == nil {
		return "", nil
	}
	text, ok := value.(string)
	if !ok {
		return "", fmt.Errorf("%w: filter %q must be a string", assistantresource.ErrInvalidRequest, name)
	}
	return strings.TrimSpace(text), nil
}

func parseResourceUUIDs(workspace, resource string) (pgtype.UUID, pgtype.UUID, error) {
	workspaceID, err := util.ParseUUID(workspace)
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, assistantresource.ErrForbidden
	}
	resourceID, err := util.ParseUUID(resource)
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, fmt.Errorf("%w: invalid resource_id", assistantresource.ErrInvalidRequest)
	}
	return workspaceID, resourceID, nil
}

func businessAssistantInput(request assistantresource.ActionRequest) (service.CreateBusinessProposalInput, error) {
	var input service.CreateBusinessProposalInput
	if err := decodeAssistantInput(request.Input, &input); err != nil {
		return service.CreateBusinessProposalInput{}, err
	}
	if request.ExpectedVersion == nil {
		return service.CreateBusinessProposalInput{}, assistantresource.ErrVersionRequired
	}
	input.BaseRevision = *request.ExpectedVersion
	return input, nil
}

func decodeAssistantInput(input map[string]any, target any) error {
	if input == nil {
		input = map[string]any{}
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("%w: encode action input", assistantresource.ErrInvalidRequest)
	}
	decoder := json.NewDecoder(strings.NewReader(string(encoded)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("%w: %v", assistantresource.ErrInvalidRequest, err)
	}
	return nil
}

func mapFromJSON(value any) map[string]any {
	encoded, _ := json.Marshal(value)
	result := map[string]any{}
	_ = json.Unmarshal(encoded, &result)
	return result
}
