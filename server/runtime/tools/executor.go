package tools

import (
	"context"
	"fmt"
	"sync"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

// ToolCallRequest represents a pending tool call.
type ToolCallRequest struct {
	ToolUseID string
	ToolName  string
	Input     map[string]interface{}
}

// ToolCallResponse is the result of a tool call execution.
type ToolCallResponse struct {
	ToolUseID string
	Result    *types.ToolResult
	Error     error
}

// DefaultMaxConcurrentTools bounds parallel work when no override is configured.
const DefaultMaxConcurrentTools = 8

// Executor bounds in-flight work per batch. Unsafe calls are ordering barriers.
type Executor struct {
	MaxConcurrency int
	registry       *Registry
	canUseTool     types.CanUseToolFn
	toolCtx        *types.ToolUseContext
}

// NewExecutor creates a new tool executor.
func NewExecutor(registry *Registry, canUseTool types.CanUseToolFn, toolCtx *types.ToolUseContext) *Executor {
	return &Executor{
		registry:   registry,
		canUseTool: canUseTool,
		toolCtx:    toolCtx,
	}
}

// RunTools preserves call/result order and only overlaps adjacent safe calls.
func (e *Executor) RunTools(ctx context.Context, calls []ToolCallRequest) []ToolCallResponse {
	if len(calls) == 0 {
		return nil
	}
	results := make([]ToolCallResponse, len(calls))
	type pendingCall struct {
		index int
		call  ToolCallRequest
	}
	var pending []pendingCall
	flush := func() {
		workers := e.MaxConcurrency
		if workers <= 0 {
			workers = DefaultMaxConcurrentTools
		}
		if workers > len(pending) {
			workers = len(pending)
		}
		var wg sync.WaitGroup
		for worker := 0; worker < workers; worker++ {
			wg.Add(1)
			go func(start int) {
				defer wg.Done()
				for i := start; i < len(pending); i += workers {
					item := pending[i]
					results[item.index] = e.runSingle(ctx, item.call)
				}
			}(worker)
		}
		wg.Wait()
		pending = pending[:0]
	}
	for i, call := range calls {
		// Permission callbacks run serially, before classifying updated input.
		prepared, concurrent, failure := e.prepareCall(ctx, call)
		if failure != nil {
			results[i] = *failure
			continue
		}
		if concurrent {
			pending = append(pending, pendingCall{index: i, call: prepared})
			continue
		}
		flush()
		results[i] = e.runSingle(ctx, prepared)
	}
	flush()
	return results
}

func failedCall(call ToolCallRequest, err error) ToolCallResponse {
	return ToolCallResponse{ToolUseID: call.ToolUseID, Error: err, Result: &types.ToolResult{
		IsError: true, Error: err.Error(),
		Content: []types.ContentBlock{{Type: types.ContentBlockText, Text: "Error: " + err.Error()}},
	}}
}

func (e *Executor) prepareCall(ctx context.Context, call ToolCallRequest) (prepared ToolCallRequest, concurrent bool, failure *ToolCallResponse) {
	defer func() {
		if recovered := recover(); recovered != nil {
			result := failedCall(call, fmt.Errorf("tool %q preparation panicked: %v", call.ToolName, recovered))
			failure = &result
		}
	}()
	reject := func(err error) (ToolCallRequest, bool, *ToolCallResponse) {
		result := failedCall(call, err)
		return call, false, &result
	}
	if err := ctx.Err(); err != nil {
		return reject(err)
	}
	tool := e.registry.Get(call.ToolName)
	if tool == nil {
		return reject(fmt.Errorf("unknown or unavailable tool: %s", call.ToolName))
	}
	if e.canUseTool != nil {
		decision, err := e.canUseTool(tool, call.Input)
		if err != nil {
			return reject(fmt.Errorf("permission check failed: %w", err))
		}
		if decision == nil || decision.Behavior != types.PermissionAllow || decision.Interrupt {
			reason := "Tool execution requires explicit permission"
			if decision != nil && decision.Reason != "" {
				reason = decision.Reason
			}
			return reject(fmt.Errorf("%s", reason))
		}
		if decision.UpdatedInput != nil {
			call.Input = decision.UpdatedInput
		}
	}
	return call, tool.IsConcurrencySafe(call.Input), nil
}

func (e *Executor) runSingle(ctx context.Context, call ToolCallRequest) (response ToolCallResponse) {
	defer func() {
		if recovered := recover(); recovered != nil {
			response = ToolCallResponse{ToolUseID: call.ToolUseID, Result: &types.ToolResult{IsError: true, Error: fmt.Sprintf("tool %q panicked: %v", call.ToolName, recovered)}}
		}
	}()
	if err := ctx.Err(); err != nil {
		return ToolCallResponse{ToolUseID: call.ToolUseID, Result: &types.ToolResult{IsError: true, Error: err.Error()}}
	}
	tool := e.registry.Get(call.ToolName)
	if tool == nil {
		return ToolCallResponse{
			ToolUseID: call.ToolUseID,
			Result: &types.ToolResult{
				IsError: true,
				Error:   "Unknown tool: " + call.ToolName,
				Content: []types.ContentBlock{{
					Type: types.ContentBlockText,
					Text: "Error: tool '" + call.ToolName + "' not found",
				}},
			},
		}
	}

	// Execute tool
	result, err := tool.Call(ctx, call.Input, e.toolCtx)
	if err == nil && result == nil {
		err = fmt.Errorf("tool %q returned no result", call.ToolName)
	}
	if err != nil {
		return ToolCallResponse{
			ToolUseID: call.ToolUseID,
			Result: &types.ToolResult{
				IsError: true,
				Error:   err.Error(),
				Content: []types.ContentBlock{{
					Type: types.ContentBlockText,
					Text: "Error: " + err.Error(),
				}},
			},
		}
	}

	return ToolCallResponse{
		ToolUseID: call.ToolUseID,
		Result:    result,
	}
}
