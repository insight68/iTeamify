package handler

import (
	"encoding/json"
	"net/http"

	"github.com/iteamify-ai/iteamify/server/internal/managedpolicy"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func rejectManagedAgentMutation(w http.ResponseWriter, agent db.Agent) bool {
	if !managedpolicy.UsesWorkspacePlatformExecution(agent) {
		return false
	}
	writeJSON(w, http.StatusConflict, map[string]any{
		"error": "this OpenAgent uses a workspace-controlled model; runtime, environment, arguments, and raw MCP configuration are protected",
		"code":  "managed_agent_execution_policy_protected",
	})
	return true
}

// rejectManagedAgentUpdateMutation keeps execution-bearing fields pinned to
// the platform runtime while allowing workspace-owned content and access
// fields on the workspace-owned Agent.
func rejectManagedAgentUpdateMutation(w http.ResponseWriter, agent db.Agent, rawFields map[string]json.RawMessage) bool {
	workspacePlatform := managedpolicy.UsesWorkspacePlatformExecution(agent)
	if !workspacePlatform {
		return false
	}

	allowed := map[string]bool{
		"name": true, "description": true, "instructions": true, "avatar_url": true,
		"visibility": true, "permission_mode": true, "invocation_targets": true,
		"status": true, "max_concurrent_tasks": true, "model": true,
	}
	for field := range rawFields {
		if !allowed[field] {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": "field " + field + " is protected by the OpenAgent execution policy",
				"code":  "managed_agent_field_protected",
				"field": field,
			})
			return true
		}
	}
	return false
}

func rejectManagedRuntimeDeletion(w http.ResponseWriter, runtime db.AgentRuntime) bool {
	if !isSystemAgentRuntime(runtime) {
		return false
	}
	writeJSON(w, http.StatusConflict, map[string]any{"error": "system runtimes are built into the platform and cannot be deleted", "code": "system_runtime_read_only"})
	return true
}

// validateWorkspaceOpenAgentForClaim is the final dispatch fence. Mutation guards
// keep ordinary APIs from creating drift, while this check ensures stale data,
// old clients, or direct database writes still cannot turn the shared daemon
// into an arbitrary command runner.

func validateWorkspaceOpenAgentForClaim(runtime db.AgentRuntime, agent db.Agent) error {
	return managedpolicy.ValidateWorkspaceOpenAgentForClaim(runtime, agent)
}
