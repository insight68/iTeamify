package tools

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

type harnessTool struct {
	name string
	safe bool
	call func(context.Context, map[string]interface{}) (*types.ToolResult, error)
}

func (t harnessTool) Name() string        { return t.name }
func (t harnessTool) Description() string { return t.name }
func (t harnessTool) InputSchema() types.ToolInputSchema {
	return types.ToolInputSchema{Type: "object"}
}
func (t harnessTool) IsReadOnly(map[string]interface{}) bool { return t.safe }
func (t harnessTool) IsConcurrencySafe(input map[string]interface{}) bool {
	return t.safe && input["unsafe"] != true
}
func (t harnessTool) Call(ctx context.Context, input map[string]interface{}, _ *types.ToolUseContext) (*types.ToolResult, error) {
	return t.call(ctx, input)
}

func TestExecutorBoundsConcurrencyAndPreservesResults(t *testing.T) {
	registry := NewRegistry()
	var active, peak atomic.Int32
	started := make(chan struct{}, 100)
	release := make(chan struct{})
	registry.Register(harnessTool{name: "read", safe: true, call: func(ctx context.Context, _ map[string]interface{}) (*types.ToolResult, error) {
		n := active.Add(1)
		defer active.Add(-1)
		for previous := peak.Load(); n > previous; previous = peak.Load() {
			if peak.CompareAndSwap(previous, n) {
				break
			}
		}
		started <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		return &types.ToolResult{}, nil
	}})
	executor := NewExecutor(registry, nil, nil)
	executor.MaxConcurrency = 3
	calls := make([]ToolCallRequest, 100)
	for i := range calls {
		calls[i] = ToolCallRequest{ToolUseID: fmt.Sprint(i), ToolName: "read"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	done := make(chan []ToolCallResponse, 1)
	go func() { done <- executor.RunTools(ctx, calls) }()
	for i := 0; i < 3; i++ {
		select {
		case <-started:
		case <-ctx.Done():
			t.Fatal("workers did not start")
		}
	}
	if n := active.Load(); n != 3 {
		t.Fatalf("active = %d", n)
	}
	close(release)
	results := <-done
	if peak.Load() != 3 || len(results) != len(calls) {
		t.Fatalf("peak = %d, results = %d", peak.Load(), len(results))
	}
	for i, result := range results {
		if result.ToolUseID != calls[i].ToolUseID {
			t.Fatalf("result %d out of order", i)
		}
	}
}

func TestExecutorUnsafeCallsAreOrderingBarriers(t *testing.T) {
	registry := NewRegistry()
	var mu sync.Mutex
	var order []string
	for _, definition := range []struct {
		name string
		safe bool
	}{{"before", true}, {"write", false}, {"after", true}} {
		name := definition.name
		registry.Register(harnessTool{name: name, safe: definition.safe, call: func(context.Context, map[string]interface{}) (*types.ToolResult, error) {
			mu.Lock()
			order = append(order, name)
			mu.Unlock()
			return &types.ToolResult{}, nil
		}})
	}
	results := NewExecutor(registry, nil, nil).RunTools(context.Background(), []ToolCallRequest{{ToolName: "before"}, {ToolName: "write"}, {ToolName: "after"}})
	if !reflect.DeepEqual(order, []string{"before", "write", "after"}) || len(results) != 3 {
		t.Fatalf("order = %v", order)
	}
}

func TestExecutorPermissionMustExplicitlyAllow(t *testing.T) {
	for _, decision := range []*types.PermissionDecision{nil, {}, {Behavior: types.PermissionAsk}, {Behavior: types.PermissionDeny}, {Behavior: types.PermissionAllow, Interrupt: true}} {
		registry := NewRegistry()
		called := false
		registry.Register(harnessTool{name: "write", call: func(context.Context, map[string]interface{}) (*types.ToolResult, error) {
			called = true
			return &types.ToolResult{}, nil
		}})
		permission := func(types.Tool, map[string]interface{}) (*types.PermissionDecision, error) { return decision, nil }
		result := NewExecutor(registry, permission, nil).RunTools(context.Background(), []ToolCallRequest{{ToolName: "write"}})
		if called || !result[0].Result.IsError {
			t.Fatalf("decision = %+v, called = %v", decision, called)
		}
	}
}

func TestExecutorClassifiesPermissionUpdatedInput(t *testing.T) {
	registry := NewRegistry()
	var active atomic.Int32
	registry.Register(harnessTool{name: "conditional", safe: true, call: func(context.Context, map[string]interface{}) (*types.ToolResult, error) {
		if active.Add(1) != 1 {
			t.Error("unsafe updated input ran concurrently")
		}
		time.Sleep(time.Millisecond)
		active.Add(-1)
		return &types.ToolResult{}, nil
	}})
	permission := func(types.Tool, map[string]interface{}) (*types.PermissionDecision, error) {
		return &types.PermissionDecision{Behavior: types.PermissionAllow, UpdatedInput: map[string]interface{}{"unsafe": true}}, nil
	}
	NewExecutor(registry, permission, nil).RunTools(context.Background(), []ToolCallRequest{{ToolName: "conditional"}, {ToolName: "conditional"}})
}

func TestExecutorCancellationDoesNotStartQueuedTools(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	registry := NewRegistry()
	var called atomic.Int32
	registry.Register(harnessTool{name: "read", safe: true, call: func(context.Context, map[string]interface{}) (*types.ToolResult, error) {
		called.Add(1)
		cancel()
		return &types.ToolResult{}, nil
	}})
	executor := NewExecutor(registry, nil, nil)
	executor.MaxConcurrency = 1
	calls := make([]ToolCallRequest, 20)
	for i := range calls {
		calls[i].ToolName = "read"
	}
	results := executor.RunTools(ctx, calls)
	if called.Load() != 1 || len(results) != 20 {
		t.Fatalf("calls = %d, results = %d", called.Load(), len(results))
	}
}

func TestExecutorConcurrentReadsKeepFileState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.txt")
	if err := os.WriteFile(path, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	registry := NewRegistry()
	registry.Register(NewFileReadTool())
	toolCtx := &types.ToolUseContext{ReadFileState: map[string]*types.FileReadState{}}
	calls := make([]ToolCallRequest, 40)
	for i := range calls {
		calls[i] = ToolCallRequest{ToolName: "Read", Input: map[string]interface{}{"file_path": path}}
	}
	for _, result := range NewExecutor(registry, nil, toolCtx).RunTools(context.Background(), calls) {
		if result.Result.IsError {
			t.Fatal(result.Result.Error)
		}
	}
	if state := toolCtx.GetFileReadState(path); state == nil || state.Content != "hello" {
		t.Fatalf("state = %+v", state)
	}
}

func TestRegistryCatalogIsStable(t *testing.T) {
	registry := NewRegistry()
	for _, name := range []string{"z", "a", "m"} {
		registry.Register(harnessTool{name: name})
	}
	for i := 0; i < 100; i++ {
		if !reflect.DeepEqual(registry.Names(), []string{"a", "m", "z"}) {
			t.Fatal("unstable names")
		}
		all := registry.All()
		for j, name := range []string{"a", "m", "z"} {
			if all[j].Name() != name {
				t.Fatal("unstable catalog")
			}
		}
	}
}
