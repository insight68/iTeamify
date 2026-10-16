package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/integrations/gmail"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func emailResourceScope(p assistantresource.Principal) (gmail.OutboundScope, error) {
	var scope gmail.OutboundScope
	for _, field := range []struct {
		value string
		dest  *pgtype.UUID
	}{{p.WorkspaceID, &scope.WorkspaceID}, {p.OriginatorUserID, &scope.UserID}, {p.ChatSessionID, &scope.ChatSessionID}, {p.TaskID, &scope.TaskID}} {
		if field.value == "" || field.dest.Scan(field.value) != nil || !field.dest.Valid {
			return scope, assistantresource.ErrForbidden
		}
	}
	return scope, nil
}

func newGmailConnectionAssistantResource(h *Handler) assistantresource.Adapter {
	return handlerAssistantResourceAdapter{
		definition: assistantresource.Definition{Name: "gmail_connection", Version: 1, ReadRoles: allWorkspaceRoles, MaxPageSize: 100,
			Description: "The current human originator's Gmail accounts. Read-only; use a connection with can_send=true for an outbound_email draft.",
			Fields:      []assistantresource.FieldDefinition{{Name: "id", Type: "uuid"}, {Name: "email_address", Type: "string"}, {Name: "can_send", Type: "boolean"}}},
		query: func(ctx context.Context, p assistantresource.Principal, request assistantresource.QueryRequest) (assistantresource.QueryResult, error) {
			scope, err := emailResourceScope(p)
			if err != nil {
				return assistantresource.QueryResult{}, err
			}
			result := assistantresource.QueryResult{Resource: "gmail_connection", Rows: []any{}}
			if h.Gmail == nil {
				return result, nil
			}
			rows, err := h.Gmail.ListConnections(ctx, scope.UserID, scope.WorkspaceID)
			if err != nil {
				return result, err
			}
			for _, row := range rows {
				result.Rows = append(result.Rows, row)
			}
			result.Count = len(result.Rows)
			result.Total = int64(result.Count)
			return result, nil
		},
	}
}

func newOutboundEmailAssistantResource(h *Handler) assistantresource.Adapter {
	stringsSchema := map[string]any{"type": "array", "items": map[string]any{"type": "string"}}
	inputSchema := objectSchema(map[string]any{
		"connection_id": map[string]any{"type": "string", "format": "uuid"},
		"to_addresses":  stringsSchema, "cc_addresses": stringsSchema, "bcc_addresses": stringsSchema,
		"subject": map[string]any{"type": "string"}, "body": map[string]any{"type": "string"}, "attachment_ids": stringsSchema,
	}, []string{"connection_id", "to_addresses", "subject", "body"})
	return handlerAssistantResourceAdapter{
		definition: assistantresource.Definition{Name: "outbound_email", Version: 1, ReadRoles: allWorkspaceRoles, MaxPageSize: 100,
			Description: "Email drafts and delivery outcomes owned by this chat's human originator. Create/update renders an email card in Chat. Only the human can click Send; there is deliberately no send action. Plain text body, optional existing attachment IDs.",
			Fields:      []assistantresource.FieldDefinition{{Name: "id", Type: "uuid"}, {Name: "status", Type: "string"}, {Name: "version", Type: "integer"}, {Name: "subject", Type: "string", Writable: true}, {Name: "body", Type: "string", Writable: true, Sensitive: true}},
			Actions: []assistantresource.ActionDefinition{
				{Name: "create", Description: "Create a complete local email draft. Does not send.", Risk: assistantresource.RiskLow, Confirmation: assistantresource.ConfirmationNone, AllowedRoles: allWorkspaceRoles, InputSchema: inputSchema},
				{Name: "update", Description: "Replace all editable draft fields. Preserve unchanged fields from resource_get; queued/sent content cannot change.", Risk: assistantresource.RiskLow, Confirmation: assistantresource.ConfirmationNone, RequiresID: true, RequiresVersion: true, AllowedRoles: allWorkspaceRoles, InputSchema: inputSchema},
			}},
		query: func(ctx context.Context, p assistantresource.Principal, request assistantresource.QueryRequest) (assistantresource.QueryResult, error) {
			scope, err := emailResourceScope(p)
			if err != nil {
				return assistantresource.QueryResult{}, err
			}
			result := assistantresource.QueryResult{Resource: "outbound_email", Rows: []any{}}
			if h.Gmail == nil {
				return result, nil
			}
			rows, err := h.Gmail.ListEmails(ctx, scope)
			if err != nil {
				return result, err
			}
			result.Total = int64(len(rows))
			for _, row := range rows {
				if request.Limit > 0 && len(result.Rows) >= request.Limit {
					break
				}
				result.Rows = append(result.Rows, row)
			}
			result.Count = len(result.Rows)
			return result, nil
		},
		get: func(ctx context.Context, p assistantresource.Principal, rawID string) (any, error) {
			scope, err := emailResourceScope(p)
			if err != nil {
				return nil, err
			}
			var id pgtype.UUID
			if id.Scan(rawID) != nil || !id.Valid {
				return nil, assistantresource.ErrInvalidRequest
			}
			if h.Gmail == nil {
				return nil, gmail.ErrNotConfigured
			}
			row, err := h.Gmail.GetEmail(ctx, scope, id)
			return row, emailResourceError(err)
		},
		preview: func(ctx context.Context, p assistantresource.Principal, request assistantresource.ActionRequest) (assistantresource.ActionPreview, error) {
			row, err := h.saveAssistantEmail(ctx, p, request, true)
			return assistantresource.ActionPreview{Resource: "outbound_email", ResourceID: request.ResourceID, Action: request.Action,
				Risk: assistantresource.RiskLow, Confirmation: assistantresource.ConfirmationNone,
				Summary: "Save email draft; the human reviews the card and clicks Send.", Changes: []assistantresource.Change{{Field: "draft", After: row}}}, err
		},
		execute: func(ctx context.Context, p assistantresource.Principal, request assistantresource.ActionRequest) (assistantresource.ActionResult, error) {
			row, err := h.saveAssistantEmail(ctx, p, request, false)
			return assistantresource.ActionResult{Resource: "outbound_email", ResourceID: row.ID, Action: request.Action, Version: &row.Version, Record: row}, err
		},
	}
}

func (h *Handler) saveAssistantEmail(ctx context.Context, p assistantresource.Principal, request assistantresource.ActionRequest, preview bool) (gmail.OutboundEmail, error) {
	var empty gmail.OutboundEmail
	if h.Gmail == nil {
		return empty, gmail.ErrNotConfigured
	}
	if request.Action != "create" && request.Action != "update" {
		return empty, assistantresource.ErrActionNotFound
	}
	scope, err := emailResourceScope(p)
	if err != nil {
		return empty, err
	}
	var id pgtype.UUID
	var version int32
	if request.Action == "update" {
		if id.Scan(request.ResourceID) != nil || !id.Valid || request.ExpectedVersion == nil {
			return empty, assistantresource.ErrInvalidRequest
		}
		version = *request.ExpectedVersion
	}
	data, err := json.Marshal(request.Input)
	if err != nil {
		return empty, err
	}
	var draft gmail.EmailDraft
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&draft); err != nil {
		return empty, fmt.Errorf("%w: invalid email input", assistantresource.ErrInvalidRequest)
	}
	row, err := h.Gmail.SaveEmailDraft(ctx, scope, id, version, draft, preview)
	return row, emailResourceError(err)
}

func emailResourceError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return gmail.ErrEmailNotFound
	}
	return err
}
