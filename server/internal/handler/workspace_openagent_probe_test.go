package handler

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"

	runtimeapi "github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/iteamify-ai/iteamify/server/internal/openagentendpoint"
)

type openAgentProbeTransport func(*http.Request) (*http.Response, error)

func (f openAgentProbeTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestOpenAgentProbeFailureClassifiesSafeDiagnostics(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		code   string
		status int
	}{
		{"Fake-IP", fmt.Errorf("send request: %w", openagentendpoint.ErrNonPublicAddress), "network_policy", 0},
		{"DNS", openagentendpoint.ErrDNSResolution, "dns_error", 0},
		{"DNS lookup", &net.DNSError{Err: "failed", Name: "provider.invalid"}, "dns_error", 0},
		{"connection", openagentendpoint.ErrConnectionFailed, "connection_error", 0},
		{"deadline", fmt.Errorf("send request: %w", context.DeadlineExceeded), "timeout", 0},
		{"certificate", x509.UnknownAuthorityError{}, "tls_error", 0},
		{"invalid response", errOpenAgentInvalidResponse, "invalid_response", 0},
		{"key", &runtimeapi.HTTPError{StatusCode: 401, Message: "credential-echo-secret"}, "authentication_error", 401},
		{"permissions", &runtimeapi.HTTPError{StatusCode: 403, Message: "credential-echo-secret"}, "authentication_error", 403},
		{"credit", &runtimeapi.HTTPError{StatusCode: 402, Message: "credential-echo-secret"}, "quota_error", 402},
		{"endpoint", &runtimeapi.HTTPError{StatusCode: 404, Message: "credential-echo-secret"}, "endpoint_error", 404},
		{"rate", &runtimeapi.HTTPError{StatusCode: 429, Message: "credential-echo-secret"}, "rate_limit", 429},
		{"model", &runtimeapi.HTTPError{StatusCode: 400, Message: "credential-echo-secret"}, "invalid_request", 400},
		{"provider", &runtimeapi.HTTPError{StatusCode: 503, Message: "credential-echo-secret"}, "provider_error", 503},
		{"unknown", errors.New("credential-echo-secret"), "connection_error", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := openAgentProbeFailure(tc.err)
			body, err := json.Marshal(result)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Code != tc.code || result.UpstreamStatus != tc.status || strings.Contains(string(body), "credential-echo-secret") {
				t.Fatalf("result=%s", body)
			}
		})
	}
}

func TestLiveOpenAgentProbeRequiresValidAnthropicResponse(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		code       string
	}{
		{"valid", `{"type":"message","role":"assistant","model":"test-model","content":[],"stop_reason":"max_tokens","usage":{"input_tokens":5,"output_tokens":1}}`, 200, ""},
		{"empty object", `{}`, 200, "invalid_response"},
		{"HTML gateway", `<html>gateway</html>`, 200, "invalid_response"},
		{"other protocol", `{"choices":[]}`, 200, "invalid_response"},
		{"rejected key", `{"error":"credential-echo-secret"}`, 401, "authentication_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("ANTHROPIC_CUSTOM_HEADERS", "Authorization:host-secret")
			tester := liveOpenAgentEndpointTester{httpClient: &http.Client{Transport: openAgentProbeTransport(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != "/anthropic/v1/messages" || r.Header.Get("X-API-Key") != "task-key" || r.Header.Get("Authorization") != "" {
					t.Errorf("wrong provider request: path=%s", r.URL.Path)
				}
				return &http.Response{StatusCode: tc.status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}}
			err := tester.Test(context.Background(), OpenAgentEndpoint{BaseURL: "https://provider.invalid/anthropic", Model: "test-model", APIKey: "task-key"})
			if tc.code == "" {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil || openAgentProbeFailure(err).Code != tc.code {
				t.Fatalf("error=%v", err)
			}
		})
	}
}
