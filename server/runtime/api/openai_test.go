package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type streamTestTransport func(*http.Request) (*http.Response, error)

func (f streamTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func openAIEvents(t *testing.T, fixture string) ([]StreamEvent, error) {
	t.Helper()
	c := NewClient(ClientConfig{APIKey: "test-key", Model: "test-model", BaseURL: "https://example.invalid", Provider: ProviderOpenAI,
		HTTPClient: &http.Client{Transport: streamTestTransport(func(r *http.Request) (*http.Response, error) {
			var req openAIRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatal(err)
			}
			if !req.StreamOptions["include_usage"] {
				t.Error("streaming usage was not requested")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(fixture)), Header: http.Header{}}, nil
		})}})
	events, errs := c.CreateMessageStream(context.Background(), MessagesRequest{})
	var result []StreamEvent
	for event := range events {
		result = append(result, event)
	}
	return result, <-errs
}

func TestOpenAIStreamNormalizesInterleavedToolBlocksAndUsage(t *testing.T) {
	fixture := `data: {"choices":[{"delta":{"content":"checking"}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-a","function":{"name":"lookup","arguments":"{\"x\":"}},{"index":1,"id":"call-b","function":{"name":"preview","arguments":"{\"y\":"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"2}"}},{"index":0,"function":{"arguments":"1}"}}]}}]}

data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}

data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":8,"total_tokens":108}}

data: [DONE]

`
	events, err := openAIEvents(t, fixture)
	if err != nil {
		t.Fatal(err)
	}
	starts := 0
	args := make(map[int]string)
	var reason string
	var input, output int
	for _, event := range events {
		switch event.Type {
		case "content_block_start":
			if event.Index != starts {
				t.Errorf("block index %d, want %d", event.Index, starts)
			}
			starts++
		case "content_block_delta":
			if value, ok := event.Delta["partial_json"].(string); ok {
				args[event.Index] += value
			}
		case "message_delta":
			if value, ok := event.Delta["stop_reason"].(string); ok {
				reason = value
			}
			if event.Usage != nil {
				input, output = event.Usage.InputTokens, event.Usage.OutputTokens
			}
		}
	}
	if starts != 3 || args[1] != `{"x":1}` || args[2] != `{"y":2}` || reason != "tool_use" || input != 100 || output != 8 || events[len(events)-1].Type != "message_stop" {
		t.Fatalf("starts=%d args=%v reason=%s usage=%d/%d events=%v", starts, args, reason, input, output, events)
	}
}

func TestOpenAIStreamRejectsTruncationAndProviderErrors(t *testing.T) {
	for _, fixture := range []string{
		"data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
		"data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
		"data: [DONE]\n\n",
		"data: {bad json}\n\n",
		"data: {\"error\":{\"type\":\"overloaded\",\"message\":\"unavailable\"}}\n\n",
	} {
		events, err := openAIEvents(t, fixture)
		if err == nil {
			t.Errorf("accepted broken stream: %s", fixture)
		}
		for _, event := range events {
			if event.Type == "message_stop" {
				t.Errorf("false terminal event: %v", event)
			}
		}
	}
}

func TestAPIStreamContainsTransportPanic(t *testing.T) {
	c := NewClient(ClientConfig{APIKey: "test-key", BaseURL: "https://example.invalid", Provider: ProviderAnthropic,
		HTTPClient: &http.Client{Transport: streamTestTransport(func(*http.Request) (*http.Response, error) { panic("transport failure") })}})
	events, errs := c.CreateMessageStream(context.Background(), MessagesRequest{})
	for range events {
	}
	if err := <-errs; err == nil || !strings.Contains(err.Error(), "panic") {
		t.Fatalf("error = %v", err)
	}
}
