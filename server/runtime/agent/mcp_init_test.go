package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func TestRequiredMCPDiscoveryFailsClosed(t *testing.T) {
	for _, scenario := range []string{"list_failure", "no_tools", "missing_allowed_tool"} {
		t.Run(scenario, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if scenario == "list_failure" {
					http.Error(w, "discovery failed", 500)
					return
				}
				var request map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&request)
				tools := []map[string]interface{}{}
				if scenario == "missing_allowed_tool" {
					tools = append(tools, map[string]interface{}{"name": "other", "inputSchema": map[string]interface{}{"type": "object"}})
				}
				_ = json.NewEncoder(w).Encode(map[string]interface{}{"jsonrpc": "2.0", "id": request["id"], "result": map[string]interface{}{"tools": tools}})
			}))
			defer server.Close()
			a := New(Options{APIKey: "test-key", Isolation: &IsolationPolicy{}, RequireMCPServers: true,
				MCPServers:   map[string]types.MCPServerConfig{"required": {Type: types.MCPTransportHTTP, URL: server.URL}},
				AllowedTools: []string{"mcp__required__expected"}})
			defer a.Close()
			if err := a.Init(context.Background()); err == nil {
				t.Fatal("required MCP unexpectedly initialized")
			}
		})
	}
}
