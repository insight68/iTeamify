package tools

import (
	"context"
	"strings"
	"testing"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

type panicTestTool struct{ nilResult bool }

func (panicTestTool) Name() string        { return "panic_test" }
func (panicTestTool) Description() string { return "Test exception isolation" }
func (panicTestTool) InputSchema() types.ToolInputSchema {
	return types.ToolInputSchema{Type: "object"}
}
func (panicTestTool) IsConcurrencySafe(map[string]interface{}) bool { return true }
func (panicTestTool) IsReadOnly(map[string]interface{}) bool        { return true }
func (tool panicTestTool) Call(context.Context, map[string]interface{}, *types.ToolUseContext) (*types.ToolResult, error) {
	if tool.nilResult {
		return nil, nil
	}
	panic("test tool panic")
}

func TestExecutorContainsConcurrentToolPanics(t *testing.T) {
	registry := NewRegistry()
	registry.Register(panicTestTool{})
	executor := NewExecutor(registry, nil, &types.ToolUseContext{})
	results := executor.RunTools(context.Background(), []ToolCallRequest{{ToolUseID: "a", ToolName: "panic_test"}, {ToolUseID: "b", ToolName: "panic_test"}})
	if len(results) != 2 {
		t.Fatalf("results = %v", results)
	}
	for _, result := range results {
		if result.Result == nil || !result.Result.IsError || !strings.Contains(result.Result.Error, "panic") {
			t.Fatalf("result = %+v", result)
		}
	}
}

func TestExecutorRejectsNilToolResult(t *testing.T) {
	registry := NewRegistry()
	registry.Register(panicTestTool{nilResult: true})
	executor := NewExecutor(registry, nil, &types.ToolUseContext{})
	results := executor.RunTools(context.Background(), []ToolCallRequest{{ToolUseID: "a", ToolName: "panic_test"}})
	if len(results) != 1 || results[0].Result == nil || !results[0].Result.IsError {
		t.Fatalf("results = %v", results)
	}
}
