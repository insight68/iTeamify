package managedpolicy

import (
	"encoding/json"
	"fmt"
	"strings"
)

// WithWebRetrievalTools adds task-scoped public web retrieval to OpenAgent
// without granting host tools or credentials.
func WithWebRetrievalTools(raw json.RawMessage) (json.RawMessage, error) {
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, fmt.Errorf("decode managed MCP profile: %w", err)
	}
	servers, _ := document["mcpServers"].(map[string]any)
	firstParty, _ := servers[FirstPartyMCPServerName].(map[string]any)
	env, _ := firstParty["env"].(map[string]any)
	allowlist, _ := env["ITEAMIFY_MCP_TOOL_ALLOWLIST"].(string)
	if strings.TrimSpace(allowlist) == "" {
		return nil, fmt.Errorf("managed first-party MCP tool allowlist is missing")
	}
	tools := strings.Split(allowlist, ",")
	for _, name := range []string{"web_search", "web_fetch"} {
		found := false
		for _, existing := range tools {
			if existing == name {
				found = true
				break
			}
		}
		if !found {
			tools = append(tools, name)
		}
	}
	env["ITEAMIFY_MCP_TOOL_ALLOWLIST"] = strings.Join(tools, ",")
	return json.Marshal(document)
}
