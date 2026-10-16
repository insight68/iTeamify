package daemon

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

type workspaceEndpointRoundTrip func(*http.Request) (*http.Response, error)

func (fn workspaceEndpointRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return fn(r) }
func TestOpenAgentFetchesEachWorkspaceWithoutGlobalCredentialFallback(t *testing.T) {
	client := NewClient("https://control.example.com")
	client.SetToken("daemon-secret")
	client.SetDaemonID("daemon-id")
	calls := 0
	client.client = &http.Client{Transport: workspaceEndpointRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer daemon-secret" || r.Header.Get("X-Daemon-ID") != "daemon-id" {
			t.Fatal("daemon identity missing")
		}
		workspace := "a"
		if strings.Contains(r.URL.Path, "workspace-b") {
			workspace = "b"
		}
		calls++
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(fmt.Sprintf(`{"provider":"anthropic","base_url":"https://provider.example.com/anthropic","model":"model-%s","api_key":"key-%s"}`, workspace, workspace)))}, nil
	})}
	a, err := client.GetWorkspaceOpenAgentRuntimeConfig(context.Background(), "workspace-a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := client.GetWorkspaceOpenAgentRuntimeConfig(context.Background(), "workspace-b")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || a.Model != "model-a" || b.Model != "model-b" || a.APIKey == b.APIKey {
		t.Fatal("workspace provider binding leaked")
	}
	env := map[string]string{"ITEAMIFY_OPENAGENT_API_KEY": "inherited-key", "ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN": "daemon-secret"}
	if err := configureManagedProviderTaskEnv(true, "openagent", Config{ManagedServiceToken: "daemon-secret"}, env); err != nil || env["ITEAMIFY_OPENAGENT_API_KEY"] != "" || env["ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN"] != "" {
		t.Fatal("machine credential entered tool env")
	}
}
func TestOpenAgentUnconfiguredWorkspaceHasNoGlobalFallback(t *testing.T) {
	client := NewClient("https://control.example.com")
	client.client = &http.Client{Transport: workspaceEndpointRoundTrip(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 204, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(""))}, nil
	})}
	t.Setenv("ITEAMIFY_OPENAGENT_API_KEY", "unused-global-key")
	config, err := client.GetWorkspaceOpenAgentRuntimeConfig(context.Background(), "workspace-a")
	if err != nil || config != nil {
		t.Fatal("unconfigured workspace inherited a global credential")
	}
}
