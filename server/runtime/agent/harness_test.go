package agent

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func TestAgentRejectsConcurrentQueriesAndCloseCancelsActiveRun(t *testing.T) {
	started := make(chan struct{})
	a := newLoopAgent(t, loopTransport(func(req *http.Request) (*http.Response, error) {
		close(started)
		<-req.Context().Done()
		return nil, req.Context().Err()
	}))
	events, errs := a.Query(context.Background(), "first")
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("query did not start")
	}
	_, err := queryResult(t, a, context.Background())
	if !errors.Is(err, ErrQueryInProgress) {
		t.Fatalf("concurrent error=%v", err)
	}
	if err := a.Clear(); !errors.Is(err, ErrQueryInProgress) {
		t.Fatalf("Clear error=%v", err)
	}
	if len(a.GetMessages()) != 1 {
		t.Fatal("Clear mutated active history")
	}
	a.Close()
	done := make(chan error, 1)
	go func() {
		for range events {
		}
		done <- <-errs
	}()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("Close did not cancel query")
	}
	_, err = queryResult(t, a, context.Background())
	if !errors.Is(err, ErrAgentClosed) {
		t.Fatalf("closed error=%v", err)
	}
}

func TestAgentMessagesAreOwnedSnapshots(t *testing.T) {
	prior := []types.Message{{Role: "user", Content: []types.ContentBlock{{Type: types.ContentBlockToolUse, Input: map[string]interface{}{"nested": []interface{}{map[string]interface{}{"value": "original"}}}}}}}
	a := New(Options{Isolation: &IsolationPolicy{}, InitialMessages: prior})
	defer a.Close()
	prior[0].Content[0].Input["nested"].([]interface{})[0].(map[string]interface{})["value"] = "caller mutation"
	copy := a.GetMessages()
	copy[0].Content[0].Input["nested"].([]interface{})[0].(map[string]interface{})["value"] = "snapshot mutation"
	if got := a.GetMessages()[0].Content[0].Input["nested"].([]interface{})[0].(map[string]interface{})["value"]; got != "original" {
		t.Fatalf("history=%v", got)
	}
}

func TestLoopEnforcesToolCatalogAtExecution(t *testing.T) {
	for _, allowed := range []bool{true, false} {
		t.Run(map[bool]string{true: "allowlist", false: "denylist"}[allowed], func(t *testing.T) {
			var called atomic.Int32
			var requests atomic.Int32
			a := newLoopAgent(t, loopTransport(func(*http.Request) (*http.Response, error) {
				fixture := textFixture("end_turn")
				if requests.Add(1) == 1 {
					fixture = toolFixture()
				}
				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(fixture))}, nil
			}))
			a.toolRegistry.Register(loopTool{call: func(context.Context) (*types.ToolResult, error) { called.Add(1); return &types.ToolResult{}, nil }})
			a.canUseTool = nil
			if allowed {
				a.opts.AllowedTools = []string{"other_tool"}
			} else {
				a.opts.DisallowedTools = []string{"test_tool"}
			}
			result, err := queryResult(t, a, context.Background())
			if err != nil || called.Load() != 0 || result.StopReason != "end_turn" {
				t.Fatalf("result=%+v err=%v calls=%d", result, err, called.Load())
			}
			history := a.GetMessages()
			if !history[2].Content[0].IsError {
				t.Fatal("unavailable tool did not produce error result")
			}
		})
	}
}

func TestLoopRejectsUnfinishedAndDuplicateToolBlocks(t *testing.T) {
	for _, fixture := range []string{
		streamFixture(fixtureStart, fixtureTextStart, fixtureTextDelta, `{"type":"message_delta","delta":{"stop_reason":"end_turn"}}`, fixtureMessageStop),
		streamFixture(fixtureStart, `{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"same","name":"test_tool","input":{}}}`, fixtureBlockStop, `{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"same","name":"test_tool","input":{}}}`, fixtureMessageStop),
	} {
		a := newLoopAgent(t, fixtureTransport(fixture))
		result, err := queryResult(t, a, context.Background())
		if err == nil || result.StopReason != "error" {
			t.Fatalf("result=%+v error=%v", result, err)
		}
	}
}

func TestStreamAssemblyPreservesThinkingAndRejectsLimit(t *testing.T) {
	a := &streamAssembler{}
	msg := &types.Message{}
	calls := []types.ToolUseBlock{}
	start := apiEventThinkingStart()
	if err := a.processEvent(start, msg, &calls); err != nil {
		t.Fatal(err)
	}
	for _, event := range []api.StreamEvent{{Type: "content_block_delta", Delta: map[string]interface{}{"type": "thinking_delta", "thinking": "reason"}}, {Type: "content_block_delta", Delta: map[string]interface{}{"type": "signature_delta", "signature": "signed"}}, {Type: "content_block_stop"}} {
		if err := a.processEvent(event, msg, &calls); err != nil {
			t.Fatal(err)
		}
	}
	if msg.Content[0].Thinking != "reason" || msg.Content[0].Signature != "signed" {
		t.Fatalf("message=%+v", msg)
	}
	if err := a.reserve(maxStreamContentBytes); err == nil {
		t.Fatal("content limit was not enforced")
	}
}

func apiEventThinkingStart() api.StreamEvent {
	return api.StreamEvent{Type: "content_block_start", ContentBlock: &types.ContentBlock{Type: types.ContentBlockThinking}}
}

func TestRequiredMCPMustBeInitializedBeforeQuery(t *testing.T) {
	a := New(Options{Isolation: &IsolationPolicy{}, RequireMCPServers: true})
	defer a.Close()
	result, err := queryResult(t, a, context.Background())
	if !errors.Is(err, ErrAgentNotInitialized) || result.StopReason != "error" {
		t.Fatalf("result=%+v error=%v", result, err)
	}
}

func TestContextLimitFailsBeforeRequestOrFallback(t *testing.T) {
	var requests atomic.Int32
	a := newLoopAgent(t, loopTransport(func(*http.Request) (*http.Response, error) {
		requests.Add(1)
		return nil, errors.New("unexpected request")
	}))
	a.opts.FallbackModel = "fallback"
	a.apiClient = api.NewClient(api.ClientConfig{APIKey: "test", Provider: api.ProviderAnthropic, DisallowProcessEnv: true, MaxRequestBytes: 100, HTTPClient: &http.Client{Transport: loopTransport(func(*http.Request) (*http.Response, error) {
		requests.Add(1)
		return nil, errors.New("unexpected request")
	})}})
	result, err := queryResult(t, a, context.Background())
	if !errors.Is(err, api.ErrRequestTooLarge) || result.StopReason != "context_limit" || requests.Load() != 0 {
		t.Fatalf("result=%+v error=%v requests=%d", result, err, requests.Load())
	}
}

type namedLoopTool struct {
	loopTool
	name string
}

func (t namedLoopTool) Name() string { return t.name }

func TestLoopAdvertisesStableCacheableToolPrefix(t *testing.T) {
	a := newLoopAgent(t, loopTransport(func(r *http.Request) (*http.Response, error) {
		var req api.MessagesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		if len(req.Tools) != 2 || req.Tools[0].Name != "a" || req.Tools[1].Name != "z" || req.Tools[1].CacheControl == nil || req.System[0].CacheControl == nil {
			t.Errorf("uncacheable request: %+v", req)
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(textFixture("end_turn")))}, nil
	}))
	a.toolRegistry.Register(namedLoopTool{name: "z"})
	a.toolRegistry.Register(namedLoopTool{name: "a"})
	_, err := queryResult(t, a, context.Background())
	if err != nil {
		t.Fatal(err)
	}
}
