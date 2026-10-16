// Package managedpolicy enforces the workspace OpenAgent execution boundary.
package managedpolicy

import (
	"encoding/json"
	"errors"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"reflect"
	"strings"
)

const ExecutionPolicyWorkspaceOpenAgentV1 = "workspace_openagent_v1"
const FirstPartyMCPServerName = "iteamify"

var workspaceOpenAgentTools = []string{
	"company_context_get",
	"company_profile_get",
	"resource_action_preview",
	"resource_catalog",
	"resource_describe",
	"resource_get",
	"resource_query",
}

func UsesWorkspaceOpenAgentExecution(agent db.Agent) bool {
	return agent.ExecutionPolicyKey == ExecutionPolicyWorkspaceOpenAgentV1
}

func UsesWorkspacePlatformExecution(agent db.Agent) bool {
	return UsesWorkspaceOpenAgentExecution(agent)
}

func workspacePlatformMCPConfig(tools []string) []byte {
	document := map[string]any{"mcpServers": map[string]any{
		"iteamify": map[string]any{
			"command": "iteamify",
			"args":    []string{"mcp", "serve"},
			"env": map[string]string{
				"ITEAMIFY_MCP_TOOL_ALLOWLIST": strings.Join(tools, ","),
			},
		},
	}}
	encoded, _ := json.Marshal(document)
	return encoded
}

func WorkspaceOpenAgentMCPConfig() []byte {
	return workspacePlatformMCPConfig(workspaceOpenAgentTools)
}

func ValidateWorkspaceOpenAgentForClaim(runtime db.AgentRuntime, agent db.Agent) error {
	if runtime.Provider != "openagent" || runtime.ProfileID.Valid {
		return errors.New("workspace OpenAgent policy requires the system OpenAgent runtime")
	}
	if !UsesWorkspaceOpenAgentExecution(agent) {
		return errors.New("agent has no workspace OpenAgent execution policy")
	}
	return validateWorkspacePlatformAgent(runtime, agent, WorkspaceOpenAgentMCPConfig())
}

func validateWorkspacePlatformAgent(runtime db.AgentRuntime, agent db.Agent, acceptedMCP []byte) error {
	if agent.WorkspaceID != runtime.WorkspaceID || !agent.RuntimeID.Valid || agent.RuntimeID != runtime.ID {
		return errors.New("workspace platform agent is not bound to the claimed workspace runtime")
	}
	validAccess := (agent.PermissionMode == "private" && agent.Visibility == "private") ||
		(agent.PermissionMode == "public_to" && (agent.Visibility == "private" || agent.Visibility == "workspace"))
	if agent.ArchivedAt.Valid || agent.RuntimeMode != "local" || !validAccess {
		return errors.New("workspace platform agent execution policy drifted")
	}
	if !jsonEquals(agent.RuntimeConfig, []byte(`{}`)) || !jsonEquals(agent.CustomEnv, []byte(`{}`)) ||
		!jsonEquals(agent.CustomArgs, []byte(`[]`)) || len(agent.ComposioToolkitAllowlist) != 0 ||
		agent.ThinkingLevel.Valid || agent.ServiceTier.Valid {
		return errors.New("workspace platform agent contains host or user-specific execution overrides")
	}
	if agent.Model.Valid && agent.Model.String != "" {
		return errors.New("workspace platform agent model must remain control-plane owned")
	}
	if jsonEquals(agent.McpConfig, acceptedMCP) {
		return nil
	}
	return errors.New("workspace platform agent MCP policy drifted")
}

func jsonEquals(left, right []byte) bool {
	var a, b any
	return json.Unmarshal(left, &a) == nil && json.Unmarshal(right, &b) == nil && reflect.DeepEqual(a, b)
}
