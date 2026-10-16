package managedpolicy

import (
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
	"strings"
	"testing"
)

func TestValidateWorkspaceOpenAgentForClaimPinsExecutionBoundary(t *testing.T) {
	workspaceID := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
	runtimeID := pgtype.UUID{Bytes: [16]byte{2}, Valid: true}
	runtime := db.AgentRuntime{
		ID: runtimeID, WorkspaceID: workspaceID, Provider: "openagent", RuntimeMode: "local",
	}
	agent := db.Agent{
		WorkspaceID: workspaceID, RuntimeID: runtimeID, RuntimeMode: "local",
		Visibility: "private", PermissionMode: "private",
		ExecutionPolicyKey: ExecutionPolicyWorkspaceOpenAgentV1,
		RuntimeConfig:      []byte(`{}`), CustomEnv: []byte(`{}`), CustomArgs: []byte(`[]`),
		McpConfig: WorkspaceOpenAgentMCPConfig(),
		Model:     pgtype.Text{String: "platform-model-v1", Valid: true},
	}
	agent.Model = pgtype.Text{}
	if err := ValidateWorkspaceOpenAgentForClaim(runtime, agent); err != nil {
		t.Fatalf("valid workspace OpenAgent claim: %v", err)
	}

	unsafe := agent
	unsafe.CustomArgs = []byte(`["--unsafe"]`)
	if err := ValidateWorkspaceOpenAgentForClaim(runtime, unsafe); err == nil {
		t.Fatal("custom args were accepted")
	}
	unsafe = agent
	unsafe.McpConfig = []byte(`{"mcpServers":{"shell":{"command":"sh"}}}`)
	if err := ValidateWorkspaceOpenAgentForClaim(runtime, unsafe); err == nil {
		t.Fatal("raw MCP drift was accepted")
	}
	unsafe = agent
	unsafe.Model = pgtype.Text{String: "other-model", Valid: true}
	if err := ValidateWorkspaceOpenAgentForClaim(runtime, unsafe); err == nil {
		t.Fatal("non-platform model was accepted")
	}
	// Workspace-authored OpenAgent agents must never widen the fixed read-only tool set.
	unsafe = agent
	unsafe.McpConfig = []byte(strings.Replace(string(WorkspaceOpenAgentMCPConfig()), `resource_catalog`, `resource_catalog,resource_action_execute`, 1))
	if err := ValidateWorkspaceOpenAgentForClaim(runtime, unsafe); err == nil {
		t.Fatal("write tool boundary was accepted on the OpenAgent runtime")
	}
}
