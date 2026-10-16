package managedpolicy

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestPlatformWebToolsPreserveBusinessAllowlistAndExistingProfiles(t *testing.T) {
	for _, raw := range []json.RawMessage{WorkspaceOpenAgentMCPConfig(), json.RawMessage(`{"mcpServers":{"iteamify":{"command":"iteamify","args":["mcp","serve"],"env":{"ITEAMIFY_MCP_TOOL_ALLOWLIST":"resource_catalog"}},"search":{"type":"http","url":"https://example.com/mcp"}}}`)} {
		result, err := WithWebRetrievalTools(raw)
		if err != nil {
			t.Fatal(err)
		}
		var before, after map[string]any
		_ = json.Unmarshal(raw, &before)
		_ = json.Unmarshal(result, &after)
		servers := after["mcpServers"].(map[string]any)
		entry := servers["iteamify"].(map[string]any)
		tools := entry["env"].(map[string]any)["ITEAMIFY_MCP_TOOL_ALLOWLIST"].(string)
		if !strings.HasSuffix(tools, ",web_search,web_fetch") {
			t.Fatal(tools)
		}
		if strings.Contains(string(raw), "search\"") && servers["search"] == nil {
			t.Fatal("third-party profile removed")
		}
		entry["env"].(map[string]any)["ITEAMIFY_MCP_TOOL_ALLOWLIST"] = strings.TrimSuffix(tools, ",web_search,web_fetch")
		if !reflect.DeepEqual(before, after) {
			t.Fatal("web tools changed other profile fields or business permissions")
		}
		again, err := WithWebRetrievalTools(result)
		if err != nil || string(again) != string(result) {
			t.Fatal("web tool augmentation is not idempotent")
		}
		if !strings.Contains(string(raw), "resource_action_execute") && strings.Contains(string(result), "resource_action_execute") {
			t.Fatal("write permission was added")
		}
	}
	if _, err := WithWebRetrievalTools(json.RawMessage(`{"mcpServers":{}}`)); err == nil {
		t.Fatal("missing first-party allowlist accepted")
	}
}
