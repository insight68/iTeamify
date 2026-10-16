package assistantresource

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var (
	ErrResourceNotFound     = errors.New("assistant resource not found")
	ErrActionNotFound       = errors.New("assistant resource action not found")
	ErrForbidden            = errors.New("assistant resource access forbidden")
	ErrConfirmationRequired = errors.New("assistant resource action requires explicit confirmation")
	ErrUserIntentRequired   = errors.New("assistant resource action requires a current user intent message")
	ErrVersionRequired      = errors.New("assistant resource action requires an expected version")
	ErrInvalidRequest       = errors.New("invalid assistant resource request")
)

type Risk string

const (
	RiskRead   Risk = "read"
	RiskLow    Risk = "low"
	RiskMedium Risk = "medium"
	RiskHigh   Risk = "high"
)

type ConfirmationPolicy string

const (
	ConfirmationNone     ConfirmationPolicy = "none"
	ConfirmationExplicit ConfirmationPolicy = "explicit"
)

// Principal is the server-resolved identity attached to one agent task. None
// of these fields may be accepted from an MCP tool payload.
type Principal struct {
	WorkspaceID      string `json:"workspace_id"`
	TaskID           string `json:"task_id"`
	AgentID          string `json:"agent_id"`
	ChatSessionID    string `json:"chat_session_id"`
	OriginatorUserID string `json:"originator_user_id"`
	Role             string `json:"role"`
}

type FieldDefinition struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description,omitempty"`
	Writable    bool   `json:"writable"`
	Sensitive   bool   `json:"sensitive,omitempty"`
}

type FilterDefinition struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Description string   `json:"description,omitempty"`
	Values      []string `json:"values,omitempty"`
}

type ActionDefinition struct {
	Name            string             `json:"name"`
	Description     string             `json:"description"`
	Risk            Risk               `json:"risk"`
	Confirmation    ConfirmationPolicy `json:"confirmation"`
	RequiresID      bool               `json:"requires_id"`
	RequiresVersion bool               `json:"requires_version"`
	AllowedRoles    []string           `json:"-"`
	InputSchema     map[string]any     `json:"input_schema"`
}

type Definition struct {
	Name        string             `json:"name"`
	Version     int                `json:"version"`
	Description string             `json:"description"`
	Fields      []FieldDefinition  `json:"fields"`
	Filters     []FilterDefinition `json:"filters"`
	Searchable  bool               `json:"searchable"`
	Paginated   bool               `json:"paginated"`
	MaxPageSize int                `json:"max_page_size"`
	Actions     []ActionDefinition `json:"actions"`
	ReadRoles   []string           `json:"-"`
}

type QueryRequest struct {
	Cursor   string         `json:"cursor,omitempty"`
	Resource string         `json:"resource"`
	Search   string         `json:"search,omitempty"`
	Filters  map[string]any `json:"filters,omitempty"`
	Limit    int            `json:"limit,omitempty"`
}

type QueryResult struct {
	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`
	Resource   string `json:"resource"`
	Rows       []any  `json:"rows"`
	Count      int    `json:"count"`
	Total      int64  `json:"total,omitempty"`
}

type ActionRequest struct {
	Resource               string         `json:"resource"`
	ResourceID             string         `json:"resource_id,omitempty"`
	Action                 string         `json:"action"`
	ExpectedVersion        *int32         `json:"expected_version,omitempty"`
	Input                  map[string]any `json:"input,omitempty"`
	Confirmed              bool           `json:"confirmed,omitempty"`
	IdempotencyKey         string         `json:"idempotency_key,omitempty"`
	UserIntentMessageID    string         `json:"user_intent_message_id,omitempty"`
	UserIntentSubmissionID string         `json:"user_intent_submission_id,omitempty"`
}

type Change struct {
	Field  string `json:"field"`
	Before any    `json:"before,omitempty"`
	After  any    `json:"after,omitempty"`
}

type ActionPreview struct {
	Resource             string             `json:"resource"`
	ResourceID           string             `json:"resource_id,omitempty"`
	Action               string             `json:"action"`
	Risk                 Risk               `json:"risk"`
	Confirmation         ConfirmationPolicy `json:"confirmation"`
	ConfirmationRequired bool               `json:"confirmation_required"`
	Changes              []Change           `json:"changes"`
	Summary              string             `json:"summary"`
}

type ActionResult struct {
	Resource   string `json:"resource"`
	ResourceID string `json:"resource_id,omitempty"`
	Action     string `json:"action"`
	Version    *int32 `json:"version,omitempty"`
	Record     any    `json:"record,omitempty"`
}

type Adapter interface {
	Definition() Definition
	Query(context.Context, Principal, QueryRequest) (QueryResult, error)
	Get(context.Context, Principal, string) (any, error)
	Preview(context.Context, Principal, ActionRequest) (ActionPreview, error)
	Execute(context.Context, Principal, ActionRequest) (ActionResult, error)
}

type Registry struct {
	adapters map[string]Adapter
}

func New() *Registry {
	return &Registry{adapters: make(map[string]Adapter)}
}

func (r *Registry) Register(adapter Adapter) error {
	definition := adapter.Definition()
	name := strings.TrimSpace(definition.Name)
	if name == "" || definition.Version < 1 {
		return fmt.Errorf("%w: resource name and positive version are required", ErrInvalidRequest)
	}
	if _, exists := r.adapters[name]; exists {
		return fmt.Errorf("%w: duplicate resource %q", ErrInvalidRequest, name)
	}
	seenActions := make(map[string]struct{}, len(definition.Actions))
	for _, action := range definition.Actions {
		if strings.TrimSpace(action.Name) == "" {
			return fmt.Errorf("%w: resource %q has an empty action name", ErrInvalidRequest, name)
		}
		if _, exists := seenActions[action.Name]; exists {
			return fmt.Errorf("%w: resource %q has duplicate action %q", ErrInvalidRequest, name, action.Name)
		}
		seenActions[action.Name] = struct{}{}
	}
	r.adapters[name] = adapter
	return nil
}

func (r *Registry) Catalog(principal Principal) []Definition {
	definitions := make([]Definition, 0, len(r.adapters))
	for _, adapter := range r.adapters {
		definition := adapter.Definition()
		if !roleAllowed(principal.Role, definition.ReadRoles) {
			continue
		}
		actions := make([]ActionDefinition, 0, len(definition.Actions))
		for _, action := range definition.Actions {
			if roleAllowed(principal.Role, action.AllowedRoles) {
				action.AllowedRoles = nil
				actions = append(actions, action)
			}
		}
		definition.ReadRoles = nil
		definition.Actions = actions
		definitions = append(definitions, definition)
	}
	sort.Slice(definitions, func(i, j int) bool { return definitions[i].Name < definitions[j].Name })
	return definitions
}

// Discover returns capability summaries. Detailed fields and input schemas are
// fetched with Describe only for the resource needed by the current task.
func (r *Registry) Discover(p Principal) []Definition {
	definitions := r.Catalog(p)
	for i := range definitions {
		definitions[i].Fields = nil
		definitions[i].Filters = nil
		for j := range definitions[i].Actions {
			definitions[i].Actions[j].InputSchema = nil
		}
	}
	return definitions
}

func (r *Registry) Describe(principal Principal, resource string) (Definition, error) {
	adapter, definition, err := r.resolveReadable(principal, resource)
	if err != nil {
		return Definition{}, err
	}
	_ = adapter
	visible := definition
	visible.ReadRoles = nil
	visible.Actions = make([]ActionDefinition, 0, len(definition.Actions))
	for _, action := range definition.Actions {
		if roleAllowed(principal.Role, action.AllowedRoles) {
			action.AllowedRoles = nil
			visible.Actions = append(visible.Actions, action)
		}
	}
	return visible, nil
}

func (r *Registry) Query(ctx context.Context, principal Principal, request QueryRequest) (QueryResult, error) {
	adapter, definition, err := r.resolveReadable(principal, request.Resource)
	if err != nil {
		return QueryResult{}, err
	}
	if request.Cursor != "" && !definition.Paginated {
		return QueryResult{}, fmt.Errorf("%w: resource does not support cursors", ErrInvalidRequest)
	}
	if request.Limit == 0 {
		request.Limit = 20
	}
	maxPageSize := definition.MaxPageSize
	if maxPageSize <= 0 {
		maxPageSize = 100
	}
	if request.Limit < 1 || request.Limit > maxPageSize {
		return QueryResult{}, fmt.Errorf("%w: limit must be between 1 and %d", ErrInvalidRequest, maxPageSize)
	}
	if strings.TrimSpace(request.Search) != "" && !definition.Searchable {
		return QueryResult{}, fmt.Errorf("%w: resource %q is not searchable", ErrInvalidRequest, definition.Name)
	}
	allowedFilters := make(map[string]struct{}, len(definition.Filters))
	for _, filter := range definition.Filters {
		allowedFilters[filter.Name] = struct{}{}
	}
	for name := range request.Filters {
		if _, ok := allowedFilters[name]; !ok {
			return QueryResult{}, fmt.Errorf("%w: filter %q is not available for %q", ErrInvalidRequest, name, definition.Name)
		}
	}
	for _, filter := range definition.Filters {
		value, present := request.Filters[filter.Name]
		if !present {
			continue
		}
		if filter.Type == "boolean" {
			if _, ok := value.(bool); !ok {
				return QueryResult{}, fmt.Errorf("%w: %s must be boolean", ErrInvalidRequest, filter.Name)
			}
			continue
		}
		text, ok := value.(string)
		if !ok {
			return QueryResult{}, fmt.Errorf("%w: %s must be a string", ErrInvalidRequest, filter.Name)
		}
		if len(filter.Values) > 0 {
			valid := false
			for _, allowed := range filter.Values {
				if text == allowed {
					valid = true
				}
			}
			if !valid {
				return QueryResult{}, fmt.Errorf("%w: invalid %s", ErrInvalidRequest, filter.Name)
			}
		}
	}
	return adapter.Query(ctx, principal, request)
}

func (r *Registry) Get(ctx context.Context, principal Principal, resource, id string) (any, error) {
	adapter, _, err := r.resolveReadable(principal, resource)
	if err != nil {
		return nil, err
	}
	return adapter.Get(ctx, principal, strings.TrimSpace(id))
}

func (r *Registry) Preview(ctx context.Context, principal Principal, request ActionRequest) (ActionPreview, error) {
	adapter, action, err := r.resolveAction(principal, request)
	if err != nil {
		return ActionPreview{}, err
	}
	preview, err := adapter.Preview(ctx, principal, request)
	if err != nil {
		return ActionPreview{}, err
	}
	preview.Resource = request.Resource
	preview.ResourceID = request.ResourceID
	preview.Action = request.Action
	preview.Risk = action.Risk
	preview.Confirmation = action.Confirmation
	preview.ConfirmationRequired = action.Confirmation != ConfirmationNone
	if preview.Changes == nil {
		preview.Changes = []Change{}
	}
	return preview, nil
}

func (r *Registry) Execute(ctx context.Context, principal Principal, request ActionRequest) (ActionResult, error) {
	adapter, action, err := r.resolveAction(principal, request)
	if err != nil {
		return ActionResult{}, err
	}
	if action.Confirmation == ConfirmationExplicit && !request.Confirmed {
		return ActionResult{}, ErrConfirmationRequired
	}
	return adapter.Execute(ctx, principal, request)
}

func (r *Registry) resolveReadable(principal Principal, resource string) (Adapter, Definition, error) {
	resource = strings.TrimSpace(resource)
	adapter, ok := r.adapters[resource]
	if !ok {
		return nil, Definition{}, fmt.Errorf("%w: %q", ErrResourceNotFound, resource)
	}
	definition := adapter.Definition()
	if !roleAllowed(principal.Role, definition.ReadRoles) {
		return nil, Definition{}, ErrForbidden
	}
	return adapter, definition, nil
}

func (r *Registry) resolveAction(principal Principal, request ActionRequest) (Adapter, ActionDefinition, error) {
	adapter, definition, err := r.resolveReadable(principal, request.Resource)
	if err != nil {
		return nil, ActionDefinition{}, err
	}
	for _, action := range definition.Actions {
		if action.Name != request.Action {
			continue
		}
		if !roleAllowed(principal.Role, action.AllowedRoles) {
			return nil, ActionDefinition{}, ErrForbidden
		}
		if action.RequiresID && strings.TrimSpace(request.ResourceID) == "" {
			return nil, ActionDefinition{}, fmt.Errorf("%w: resource_id is required", ErrInvalidRequest)
		}
		if action.RequiresVersion && request.ExpectedVersion == nil {
			return nil, ActionDefinition{}, ErrVersionRequired
		}
		return adapter, action, nil
	}
	return nil, ActionDefinition{}, fmt.Errorf("%w: %s.%s", ErrActionNotFound, definition.Name, request.Action)
}

func roleAllowed(role string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, candidate := range allowed {
		if role == candidate {
			return true
		}
	}
	return false
}
