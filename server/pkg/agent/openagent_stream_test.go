package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func writeOpenAgentChunks(w http.ResponseWriter, chunks ...string) {
	w.Header().Set("Content-Type", "text/event-stream")
	for _, chunk := range chunks {
		_, _ = fmt.Fprintf(w, "data: %s\n\n", chunk)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
}

func TestOpenAgentStreamsToolOutputAndResumesDurableRounds(t *testing.T) {
	cwd := t.TempDir()
	store, err := newOpenAgentSessionStore(cwd)
	if err != nil {
		t.Fatal(err)
	}
	continueFirst := make(chan struct{})
	var calls, checkpoints atomic.Int32
	var sessionID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/mcp" {
			var request struct {
				ID     interface{} `json:"id"`
				Method string      `json:"method"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Error(err)
				return
			}
			result := map[string]interface{}{"content": []map[string]interface{}{{"type": "text", "text": "nested tool output"}}}
			if request.Method == "tools/list" {
				result = map[string]interface{}{"tools": []map[string]interface{}{{"name": "lookup", "description": "Fixture lookup", "inputSchema": map[string]interface{}{"type": "object"}}}}
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"jsonrpc": "2.0", "id": request.ID, "result": result})
			return
		}
		n := calls.Add(1)
		if n == 1 {
			writeOpenAgentChunks(w, `{"choices":[{"delta":{"content":"checking "}}]}`)
			select {
			case <-continueFirst:
			case <-r.Context().Done():
				return
			}
			writeOpenAgentChunks(w,
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"mcp__test__lookup","arguments":"{}"}}]}}]}`,
				`{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`,
				`{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":7}}`, `[DONE]`)
			return
		}
		if n == 2 && checkpoints.Load() != 1 {
			t.Error("next model request preceded durable tool checkpoint")
		}
		if n == 3 {
			var request struct {
				Messages []json.RawMessage `json:"messages"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil || len(request.Messages) < 5 {
				t.Errorf("resume history=%d error=%v", len(request.Messages), err)
			}
		}
		writeOpenAgentChunks(w, `{"choices":[{"delta":{"content":"done"}}]}`, `{"choices":[{"delta":{},"finish_reason":"stop"}]}`,
			`{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":7}}`, `[DONE]`)
	}))
	defer server.Close()
	backend, err := New("openagent", Config{Env: map[string]string{"CODEANY_API_KEY": "test-key", "CODEANY_BASE_URL": server.URL}})
	if err != nil {
		t.Fatal(err)
	}
	mcpConfig, _ := json.Marshal(map[string]interface{}{"mcpServers": map[string]interface{}{"test": map[string]interface{}{"type": "http", "url": server.URL + "/mcp"}}})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	session, err := backend.Execute(ctx, "test prompt", ExecOptions{Cwd: cwd, Model: "test-model", McpConfig: mcpConfig,
		OnSessionCheckpoint: func(id string, usage map[string]TokenUsage) error {
			snapshot, loadErr := store.load(id)
			if loadErr != nil {
				return loadErr
			}
			n := checkpoints.Add(1)
			if len(snapshot.Messages) != int(n+2) || usage["test-model"].InputTokens != int64(100*n) {
				t.Errorf("checkpoint=%d messages=%d usage=%v", n, len(snapshot.Messages), usage)
			}
			return nil
		}})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case msg := <-session.Messages:
		if msg.Type != MessageText || msg.Content != "checking " {
			t.Fatalf("first message=%+v", msg)
		}
	case <-ctx.Done():
		t.Fatal("no text delta before model response finished")
	}
	close(continueFirst)
	text := "checking "
	var toolOutput string
	for msg := range session.Messages {
		if msg.Type == MessageText {
			text += msg.Content
		}
		if msg.Type == MessageToolResult {
			toolOutput = msg.Output
		}
		if msg.Type == MessageStatus {
			if _, err := store.load(msg.SessionID); err != nil {
				t.Error("published unusable resume pointer", err)
			}
		}
	}
	result := <-session.Result
	if text != "checking done" || toolOutput != "nested tool output" || result.Status != "completed" || result.Usage["test-model"].InputTokens != 200 || result.Usage["test-model"].OutputTokens != 14 || checkpoints.Load() != 2 {
		t.Fatalf("text=%s output=%s checkpoints=%d result=%+v", text, toolOutput, checkpoints.Load(), result)
	}
	sessionID = result.SessionID
	resumed, err := backend.Execute(ctx, "follow-up", ExecOptions{Cwd: cwd, Model: "test-model", McpConfig: mcpConfig, ResumeSessionID: sessionID})
	if err != nil {
		t.Fatal(err)
	}
	for range resumed.Messages {
	}
	if result := <-resumed.Result; result.Status != "completed" || result.SessionID != sessionID {
		t.Fatalf("resumed result=%+v", result)
	}
}

func TestOpenAgentBackpressurePreservesAllDeltas(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for i := 0; i < 600; i++ {
			writeOpenAgentChunks(w, `{"choices":[{"delta":{"content":"x"}}]}`)
		}
		writeOpenAgentChunks(w, `{"choices":[{"delta":{},"finish_reason":"stop"}]}`, `{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":600}}`, `[DONE]`)
	}))
	defer server.Close()
	backend, _ := New("openagent", Config{Env: map[string]string{"CODEANY_API_KEY": "test-key", "CODEANY_BASE_URL": server.URL}})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	session, err := backend.Execute(ctx, "test", ExecOptions{Cwd: t.TempDir(), Model: "test-model"})
	if err != nil {
		t.Fatal(err)
	}
	// Let the producer fill the bounded message queue before consuming.
	time.Sleep(100 * time.Millisecond)
	var text strings.Builder
	for msg := range session.Messages {
		if msg.Type == MessageText {
			text.WriteString(msg.Content)
		}
	}
	result := <-session.Result
	if text.Len() != 600 || result.Status != "completed" || result.Output != text.String() {
		t.Fatalf("text length=%d result=%+v", text.Len(), result)
	}
}

func TestBuildResultFromSDKRequiresExplicitCompletion(t *testing.T) {
	for _, reason := range []string{"", "error", "max_turns", "budget_exceeded", "max_tokens", "runtime_error", "cancelled", "timeout"} {
		result := buildResultFromSDK(types.SDKMessage{Type: types.MessageTypeResult, Text: "partial answer", Usage: &types.Usage{InputTokens: 100}, StopReason: reason}, "session", "model", map[string]TokenUsage{}, time.Now())
		if result.Status == "completed" || result.Usage["model"].InputTokens != 100 || result.Error == "" {
			t.Errorf("reason=%q result=%+v", reason, result)
		}
	}
}
