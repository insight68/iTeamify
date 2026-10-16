package agent

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

type loopTransport func(*http.Request) (*http.Response, error)

func (f loopTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func streamFixture(events ...string) string {
	return "data: " + strings.Join(events, "\n\ndata: ") + "\n\n"
}

const fixtureStart = `{"type":"message_start","message":{"model":"test-model","usage":{"input_tokens":100,"output_tokens":0}}}`
const fixtureTextStart = `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`
const fixtureTextDelta = `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"complete answer"}}`
const fixtureBlockStop = `{"type":"content_block_stop","index":0}`
const fixtureMessageStop = `{"type":"message_stop"}`

func textFixture(reason string) string {
	return streamFixture(fixtureStart, fixtureTextStart, fixtureTextDelta, fixtureBlockStop,
		`{"type":"message_delta","delta":{"stop_reason":"`+reason+`"},"usage":{"output_tokens":7}}`, fixtureMessageStop)
}

func toolFixture() string {
	return streamFixture(fixtureStart,
		`{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"test_tool","input":{}}}`,
		fixtureBlockStop, `{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}`, fixtureMessageStop)
}

func newLoopAgent(t *testing.T, transport http.RoundTripper) *Agent {
	t.Helper()
	a := New(Options{APIKey: "test-key", BaseURL: "https://test.invalid", Provider: "anthropic", Model: "test-model", MaxTurns: 3, Isolation: &IsolationPolicy{}})
	a.apiClient = api.NewClient(api.ClientConfig{APIKey: "test-key", BaseURL: "https://test.invalid", Provider: api.ProviderAnthropic, Model: "test-model", HTTPClient: &http.Client{Transport: transport}})
	t.Cleanup(a.Close)
	return a
}

func fixtureTransport(body string) http.RoundTripper {
	return loopTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})
}

func queryResult(t *testing.T, a *Agent, ctx context.Context) (types.SDKMessage, error) {
	t.Helper()
	events, errs := a.Query(ctx, "test input")
	var result types.SDKMessage
	results := 0
	for event := range events {
		if event.Type == types.MessageTypeResult {
			result = event
			results++
		}
	}
	if results != 1 {
		t.Fatalf("terminal results = %d, want 1", results)
	}
	return result, <-errs
}

func TestLoopDrainsCompleteStreamBeforeReadingError(t *testing.T) {
	for i := 0; i < 100; i++ {
		a := newLoopAgent(t, fixtureTransport(textFixture("end_turn")))
		result, err := queryResult(t, a, context.Background())
		if err != nil || result.Text != "complete answer" || result.Usage.InputTokens != 100 || result.Usage.OutputTokens != 7 {
			t.Fatalf("iteration %d: result=%+v error=%v", i, result, err)
		}
	}
}

func TestLoopRejectsBrokenStreamsAndKeepsUsage(t *testing.T) {
	for _, suffix := range []string{"", `{"type":"error","error":{"type":"overloaded_error","message":"test overload"}}`} {
		t.Run(suffix, func(t *testing.T) {
			body := streamFixture(fixtureStart, fixtureTextStart, fixtureTextDelta)
			if suffix != "" {
				body += streamFixture(suffix)
			}
			a := newLoopAgent(t, fixtureTransport(body))
			result, err := queryResult(t, a, context.Background())
			if err == nil || result.StopReason != "error" || result.Usage.InputTokens != 100 {
				t.Fatalf("result=%+v error=%v", result, err)
			}
		})
	}
}

type loopTool struct {
	call func(context.Context) (*types.ToolResult, error)
}

func (loopTool) Name() string                                  { return "test_tool" }
func (loopTool) Description() string                           { return "Test tool" }
func (loopTool) InputSchema() types.ToolInputSchema            { return types.ToolInputSchema{Type: "object"} }
func (loopTool) IsConcurrencySafe(map[string]interface{}) bool { return false }
func (loopTool) IsReadOnly(map[string]interface{}) bool        { return true }
func (tool loopTool) Call(ctx context.Context, _ map[string]interface{}, _ *types.ToolUseContext) (*types.ToolResult, error) {
	if tool.call != nil {
		return tool.call(ctx)
	}
	return &types.ToolResult{Content: []types.ContentBlock{{Type: types.ContentBlockText, Text: "tool output"}}}, nil
}

func TestLoopLimitsAreExplicitAndCheckpointToolRound(t *testing.T) {
	for _, reason := range []string{"max_turns", "budget_exceeded"} {
		t.Run(reason, func(t *testing.T) {
			a := newLoopAgent(t, fixtureTransport(toolFixture()))
			a.toolRegistry.Register(loopTool{})
			a.canUseTool = nil
			if reason == "max_turns" {
				a.opts.MaxTurns = 1
			} else {
				a.opts.MaxBudgetUSD = 0.000001
			}
			checkpoints := 0
			a.opts.OnCheckpoint = func(sessionID string, messages []types.Message) error {
				checkpoints++
				if sessionID == "" || len(messages) != 3 || messages[2].Content[0].Type != types.ContentBlockToolResult {
					t.Errorf("invalid checkpoint: %v", messages)
				}
				return nil
			}
			result, err := queryResult(t, a, context.Background())
			if err == nil || result.StopReason != reason || result.Usage.InputTokens != 100 || checkpoints != 1 {
				t.Fatalf("result=%+v error=%v checkpoints=%d", result, err, checkpoints)
			}
		})
	}
}

func TestLoopRejectsOutputLimit(t *testing.T) {
	a := newLoopAgent(t, fixtureTransport(textFixture("max_tokens")))
	result, err := queryResult(t, a, context.Background())
	if err == nil || result.StopReason != "max_tokens" {
		t.Fatalf("result=%+v error=%v", result, err)
	}
}

func TestLoopStreamsBeforeResponseFinishes(t *testing.T) {
	reader, writer := io.Pipe()
	a := newLoopAgent(t, loopTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: reader}, nil
	}))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer reader.Close()
	defer writer.Close()
	events, errs := a.Query(ctx, "test input")
	go func() { _, _ = io.WriteString(writer, streamFixture(fixtureStart, fixtureTextStart, fixtureTextDelta)) }()
	select {
	case event := <-events:
		if event.Type != types.MessageTypeAssistantDelta || event.Message.Content[0].Text != "complete answer" {
			t.Fatalf("first event=%+v", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no delta while stream remains open")
	}
	go func() {
		_, _ = io.WriteString(writer, streamFixture(fixtureBlockStop, `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}`, fixtureMessageStop))
		_ = writer.Close()
	}()
	for range events {
	}
	if err := <-errs; err != nil {
		t.Fatal(err)
	}
}

func TestLoopContainsPanicAndKeepsCompletedUsage(t *testing.T) {
	a := newLoopAgent(t, fixtureTransport(textFixture("end_turn")))
	a.opts.OnCheckpoint = func(string, []types.Message) error { panic("test checkpoint panic") }
	result, err := queryResult(t, a, context.Background())
	if err == nil || result.StopReason != "runtime_error" || result.Usage.InputTokens != 100 {
		t.Fatalf("result=%+v error=%v", result, err)
	}
}

func TestLoopRejectsNegativeBlockIndex(t *testing.T) {
	a := newLoopAgent(t, fixtureTransport(streamFixture(fixtureStart, fixtureTextStart,
		`{"type":"content_block_delta","index":-1,"delta":{"type":"text_delta","text":"invalid"}}`, fixtureMessageStop)))
	result, err := queryResult(t, a, context.Background())
	if err == nil || result.StopReason != "error" {
		t.Fatalf("result=%+v error=%v", result, err)
	}
}

func TestLoopCancellationKeepsUsage(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a := newLoopAgent(t, fixtureTransport(toolFixture()))
	a.toolRegistry.Register(loopTool{call: func(context.Context) (*types.ToolResult, error) { cancel(); return &types.ToolResult{}, nil }})
	a.canUseTool = nil
	result, err := queryResult(t, a, ctx)
	if !errors.Is(err, context.Canceled) || result.StopReason != "cancelled" || result.Usage.InputTokens != 100 {
		t.Fatalf("result=%+v error=%v", result, err)
	}
}

func TestLoopCancellationWithFullQueueStillDeliversUsageReceipt(t *testing.T) {
	fixture := streamFixture(fixtureStart, fixtureTextStart)
	for i := 0; i < 1000; i++ {
		fixture += streamFixture(fixtureTextDelta)
	}
	fixture += streamFixture(fixtureBlockStop, `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1000}}`, fixtureMessageStop)
	a := newLoopAgent(t, fixtureTransport(fixture))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	events, errs := a.Query(ctx, "test")
	deadline := time.After(time.Second)
	for len(events) < cap(events) {
		select {
		case <-deadline:
			t.Fatal("stream did not fill its bounded queue")
		default:
			time.Sleep(time.Millisecond)
		}
	}
	cancel()
	var terminal types.SDKMessage
	for event := range events {
		if event.Type == types.MessageTypeResult {
			terminal = event
		}
	}
	if err := <-errs; !errors.Is(err, context.Canceled) || terminal.Usage == nil || terminal.Usage.InputTokens != 100 || terminal.StopReason != "cancelled" {
		t.Fatalf("terminal=%+v error=%v", terminal, err)
	}
}

func TestLoopFallbackAccountsForEachModel(t *testing.T) {
	calls := 0
	a := newLoopAgent(t, loopTransport(func(*http.Request) (*http.Response, error) {
		calls++
		body := streamFixture(fixtureStart)
		if calls == 2 {
			body = strings.ReplaceAll(textFixture("end_turn"), "test-model", "fallback-model")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	}))
	a.opts.FallbackModel = "fallback-model"
	terminal, err := queryResult(t, a, context.Background())
	if err != nil || terminal.Usage.InputTokens != 200 || terminal.UsageByModel["test-model"].InputTokens != 100 || terminal.UsageByModel["fallback-model"].OutputTokens != 7 {
		t.Fatalf("terminal=%+v error=%v", terminal, err)
	}
}

func TestLoopCheckpointFailurePreservesToolOutcome(t *testing.T) {
	a := newLoopAgent(t, fixtureTransport(toolFixture()))
	a.toolRegistry.Register(loopTool{})
	a.canUseTool = nil
	a.opts.OnCheckpoint = func(string, []types.Message) error { return errors.New("test disk error") }
	events, errs := a.Query(context.Background(), "test")
	var terminal types.SDKMessage
	var output string
	for event := range events {
		if event.Type == "tool_result" {
			output = event.Message.Content[0].Content[0].Text
		}
		if event.Type == types.MessageTypeResult {
			terminal = event
		}
	}
	if err := <-errs; err == nil || output != "tool output" || terminal.StopReason != "checkpoint_error" || terminal.Usage.InputTokens != 100 {
		t.Fatalf("output=%q terminal=%+v error=%v", output, terminal, err)
	}
}

func TestLoopPreservesThinkingSignatureAcrossToolRound(t *testing.T) {
	calls := 0
	a := newLoopAgent(t, loopTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		body := textFixture("end_turn")
		if calls == 1 {
			body = streamFixture(fixtureStart,
				`{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}`,
				`{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"fixture reasoning"}}`,
				`{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"opaque-proof"}}`, fixtureBlockStop,
				`{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-1","name":"test_tool","input":{}}}`,
				`{"type":"content_block_stop","index":1}`, `{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}`, fixtureMessageStop)
		} else {
			var req api.MessagesRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Error(err)
			}
			if len(req.Messages) < 2 || req.Messages[1].Content[0].Signature != "opaque-proof" {
				t.Error("tool follow-up omitted thinking signature")
			}
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	}))
	a.toolRegistry.Register(loopTool{})
	a.canUseTool = nil
	result, err := queryResult(t, a, context.Background())
	if err != nil || result.StopReason != "end_turn" || calls != 2 {
		t.Fatalf("result=%+v calls=%d error=%v", result, calls, err)
	}
}
