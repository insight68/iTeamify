package types

import (
	"context"
	"sync"
)

// PermissionBehavior represents a permission decision.
type PermissionBehavior string

const (
	PermissionAllow PermissionBehavior = "allow"
	PermissionDeny  PermissionBehavior = "deny"
	PermissionAsk   PermissionBehavior = "ask"
)

// PermissionDecision is the result of a permission check.
type PermissionDecision struct {
	Behavior     PermissionBehavior     `json:"behavior"`
	UpdatedInput map[string]interface{} `json:"updated_input,omitempty"`
	Reason       string                 `json:"reason,omitempty"`
	Interrupt    bool                   `json:"interrupt,omitempty"`
}

// PermissionMode controls tool approval behavior.
type PermissionMode string

const (
	PermissionModeDefault           PermissionMode = "default"
	PermissionModeAcceptEdits       PermissionMode = "acceptEdits"
	PermissionModeBypassPermissions PermissionMode = "bypassPermissions"
	PermissionModePlan              PermissionMode = "plan"
	PermissionModeDontAsk           PermissionMode = "dontAsk"
)

// CanUseToolFn is a callback for permission decisions.
type CanUseToolFn func(tool Tool, input map[string]interface{}) (*PermissionDecision, error)

// ToolResult is the result of executing a tool.
type ToolResult struct {
	Data    interface{}    `json:"data,omitempty"`
	Content []ContentBlock `json:"content,omitempty"`
	IsError bool           `json:"is_error,omitempty"`
	Error   string         `json:"error,omitempty"`
}

// ToolInputSchema describes the JSON schema for tool input.
type ToolInputSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties,omitempty"`
	Required   []string               `json:"required,omitempty"`
}

// Tool defines the interface for an executable tool.
type Tool interface {
	// Name returns the tool's unique name.
	Name() string

	// Description returns a human-readable description for the model.
	Description() string

	// InputSchema returns the JSON schema for tool input.
	InputSchema() ToolInputSchema

	// Call executes the tool with the given input.
	Call(ctx context.Context, input map[string]interface{}, tCtx *ToolUseContext) (*ToolResult, error)

	// IsConcurrencySafe returns whether the tool can run concurrently.
	IsConcurrencySafe(input map[string]interface{}) bool

	// IsReadOnly returns whether the tool only reads (no side effects).
	IsReadOnly(input map[string]interface{}) bool
}

// ToolUseContext provides context for tool execution.
type ToolUseContext struct {
	fileStateMu sync.RWMutex
	// WorkingDir is the current working directory.
	WorkingDir string

	// AbortCtx is a cancellable context for the tool execution.
	AbortCtx context.Context

	// ReadFileState tracks file read state for staleness detection.
	ReadFileState map[string]*FileReadState
}

// FileReadState tracks when a file was last read.
type FileReadState struct {
	Content   string
	Timestamp int64
	Offset    int
	Limit     int
}

// GetFileReadState returns a copy of the cached state under the context lock.
func (c *ToolUseContext) GetFileReadState(path string) *FileReadState {
	if c == nil {
		return nil
	}
	c.fileStateMu.RLock()
	defer c.fileStateMu.RUnlock()
	state := c.ReadFileState[path]
	if state == nil {
		return nil
	}
	copy := *state
	return &copy
}

// SetFileReadState serializes updates from concurrent file readers.
func (c *ToolUseContext) SetFileReadState(path string, state *FileReadState) {
	if c == nil || state == nil {
		return
	}
	c.fileStateMu.Lock()
	defer c.fileStateMu.Unlock()
	if c.ReadFileState != nil {
		copy := *state
		c.ReadFileState[path] = &copy
	}
}
