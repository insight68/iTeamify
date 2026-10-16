package api

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestClientIsolationIncludesAllAmbientHTTPSettings(t *testing.T) {
	t.Setenv("CODEANY_API_KEY", "host-secret")
	t.Setenv("CODEANY_BASE_URL", "https://host.invalid")
	t.Setenv("CODEANY_MODEL", "host-model")
	t.Setenv("CODEANY_CUSTOM_HEADERS", "Authorization:host-secret,X-Host:secret")
	t.Setenv("API_TIMEOUT_MS", "1")
	t.Setenv("HTTPS_PROXY", "http://host.invalid")
	headers := map[string]string{"X-Task": "task"}
	c := NewClient(ClientConfig{DisallowProcessEnv: true, CustomHeaders: headers})
	defer c.Close()
	if c.config.APIKey != "" || c.config.BaseURL != defaultBaseURL || c.config.Model != defaultModel || c.config.CustomHeaders["Authorization"] != "" || c.config.HTTPClient.Timeout != 10*time.Minute {
		t.Fatalf("ambient config inherited: %+v", c.config)
	}
	transport := c.config.HTTPClient.Transport.(*http.Transport)
	if transport.Proxy != nil {
		t.Fatal("isolated client inherited proxy")
	}
	c.config.CustomHeaders["X-Task"] = "changed"
	if headers["X-Task"] != "task" {
		t.Fatal("caller headers mutated")
	}
}

func TestClientReusesConnectionsWithoutSharingCredentials(t *testing.T) {
	var connections atomic.Int32
	keys := make(chan string, 2)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		keys <- r.Header.Get("X-API-Key")
		_, _ = io.WriteString(w, `{"model":"test","role":"assistant","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}`)
	}))
	server.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateNew {
			connections.Add(1)
		}
	}
	server.Start()
	defer server.Close()
	a := NewClient(ClientConfig{APIKey: "task-a", BaseURL: server.URL, Provider: ProviderAnthropic, DisallowProcessEnv: true})
	b := NewClient(ClientConfig{APIKey: "task-b", BaseURL: server.URL, Provider: ProviderAnthropic, DisallowProcessEnv: true})
	defer b.Close()
	if _, err := a.CreateMessage(context.Background(), MessagesRequest{}); err != nil {
		t.Fatal(err)
	}
	a.Close()
	if _, err := b.CreateMessage(context.Background(), MessagesRequest{}); err != nil {
		t.Fatal(err)
	}
	if connections.Load() != 1 || <-keys != "task-a" || <-keys != "task-b" {
		t.Fatal("connection reuse or per-task credential isolation failed")
	}
}

func TestRetryKeepsFinalErrorBodyAndStableRequestID(t *testing.T) {
	for _, provider := range []Provider{ProviderAnthropic, ProviderOpenAI} {
		t.Run(string(provider), func(t *testing.T) {
			calls := 0
			requestID := ""
			c := NewClient(ClientConfig{APIKey: "test", Provider: provider, DisallowProcessEnv: true, HTTPClient: &http.Client{Transport: streamTestTransport(func(req *http.Request) (*http.Response, error) {
				calls++
				id := req.Header.Get("X-Client-Request-Id")
				if requestID == "" {
					requestID = id
				} else if id != requestID {
					t.Error("request id changed on retry")
				}
				return &http.Response{StatusCode: 503, Header: http.Header{"Retry-After": []string{"0"}}, Body: io.NopCloser(strings.NewReader("exhausted-provider-error"))}, nil
			})}})
			events, errs := c.CreateMessageStream(context.Background(), MessagesRequest{})
			for range events {
			}
			err := <-errs
			if err == nil || !strings.Contains(err.Error(), "exhausted-provider-error") || calls != maxRetries+1 || requestID == "" {
				t.Fatalf("calls=%d err=%v", calls, err)
			}
		})
	}
}

func TestNonStreamingRetryHonorsCancellation(t *testing.T) {
	for _, provider := range []Provider{ProviderAnthropic, ProviderOpenAI} {
		t.Run(string(provider), func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			c := NewClient(ClientConfig{APIKey: "test", Provider: provider, DisallowProcessEnv: true, HTTPClient: &http.Client{Transport: streamTestTransport(func(*http.Request) (*http.Response, error) {
				calls++
				cancel()
				return &http.Response{StatusCode: 429, Header: http.Header{"Retry-After": []string{"30"}}, Body: io.NopCloser(strings.NewReader("rate limited"))}, nil
			})}})
			start := time.Now()
			_, err := c.CreateMessage(ctx, MessagesRequest{})
			if !errors.Is(err, context.Canceled) || calls != 1 || time.Since(start) > time.Second {
				t.Fatalf("calls=%d err=%v elapsed=%v", calls, err, time.Since(start))
			}
		})
	}
}

func TestBoundedResponseAndRetryDelay(t *testing.T) {
	data, err := readBoundedResponse(strings.NewReader(strings.Repeat("x", 101)), 100)
	if err == nil || len(data) != 100 {
		t.Fatalf("size=%d error=%v", len(data), err)
	}
	if delay := retryDelay("9223372036854775807", 1); delay != maxRetryDelay {
		t.Fatalf("delay=%v", delay)
	}
}

func TestRequestLimitAppliesToBothProviders(t *testing.T) {
	for _, provider := range []Provider{ProviderAnthropic, ProviderOpenAI} {
		c := NewClient(ClientConfig{APIKey: "test", Provider: provider, DisallowProcessEnv: true, MaxRequestBytes: 10, HTTPClient: &http.Client{Transport: streamTestTransport(func(*http.Request) (*http.Response, error) {
			t.Error("oversized request was sent")
			return nil, errors.New("unexpected request")
		})}})
		if _, err := c.CreateMessage(context.Background(), MessagesRequest{}); !errors.Is(err, ErrRequestTooLarge) {
			t.Fatalf("provider=%s error=%v", provider, err)
		}
	}
}
