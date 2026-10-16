package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/iteamify-ai/iteamify/server/internal/daemonws"
	"github.com/iteamify-ai/iteamify/server/internal/managedpolicy"
)

// TestDaemonRPCHandler_TasksClaim pins the WS-first claim binding (MUL-4257):
// a tasks.claim RPC, driven with the WS connection's identity, reuses the HTTP
// claim handler and claims a queued task for the daemon's runtime.
func TestDaemonRPCHandler_TasksClaim(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	rt := createClaimReclaimRuntime(t, ctx, "WS claim rt")
	a, i := createClaimReclaimAgentAndIssue(t, ctx, rt, "WS claim agent")
	taskID := seedQueuedIssueTask(t, ctx, a, rt, i)

	identity := daemonws.ClientIdentity{
		DaemonID:     "ws-daemon",
		UserID:       testUserID,
		WorkspaceID:  testWorkspaceID,
		WorkspaceIDs: []string{testWorkspaceID},
		RuntimeIDs:   []string{rt},
	}
	body, _ := json.Marshal(map[string]any{
		"daemon_id":   "ws-daemon",
		"runtime_ids": []string{rt},
		"max_tasks":   5,
	})

	status, respBody, err := testHandler.DaemonRPCHandler(ctx, identity, "tasks.claim", body)
	if err != nil {
		t.Fatalf("DaemonRPCHandler: %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", status, string(respBody))
	}
	var resp batchClaimReceiptResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Tasks) != 1 || resp.Tasks[0].ID != taskID {
		t.Fatalf("claimed %+v, want the queued task %s", resp.Tasks, taskID)
	}
	if resp.Tasks[0].RuntimeID != rt {
		t.Fatalf("claimed runtime = %s, want %s", resp.Tasks[0].RuntimeID, rt)
	}

	var dbStatus string
	if err := testPool.QueryRow(ctx, `SELECT status FROM agent_task_queue WHERE id = $1`, taskID).Scan(&dbStatus); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if dbStatus != "dispatched" {
		t.Fatalf("task status = %s, want dispatched", dbStatus)
	}
}

// TestDaemonRPCHandler_UnknownMethod returns 404 for an unknown method.
func TestDaemonRPCHandler_UnknownMethod(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	status, _, err := testHandler.DaemonRPCHandler(context.Background(),
		daemonws.ClientIdentity{DaemonID: "ws-daemon"}, "does.not.exist", nil)
	if status != http.StatusNotFound || err == nil {
		t.Fatalf("status=%d err=%v, want 404 + error", status, err)
	}
}

// A managed WebSocket represents the global daemon, not the first workspace
// in its connection list. The in-process RPC bridge must preserve that auth
// path so workspace runtime bindings authorize every requested OpenAgent handle.
func TestDaemonRPCHandler_ManagedClaimIsNotPinnedToPrimaryWorkspace(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	runtimeID := createClaimReclaimRuntime(t, ctx, "Managed WS claim rt")
	agentID, _ := createClaimReclaimAgentAndIssue(t, ctx, runtimeID, "Managed WS claim agent")
	var sessionID, taskID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO chat_session (workspace_id, agent_id, creator_id, title, status, runtime_id)
		VALUES ($1, $2, $3, 'Managed global daemon claim', 'active', $4)
		RETURNING id
	`, testWorkspaceID, agentID, testUserID, runtimeID).Scan(&sessionID); err != nil {
		t.Fatalf("create managed chat session: %v", err)
	}
	if _, err := testPool.Exec(ctx, `
		INSERT INTO chat_message (chat_session_id, role, content)
		VALUES ($1, 'user', 'Verify the global managed daemon binding')
	`, sessionID); err != nil {
		t.Fatalf("create managed chat message: %v", err)
	}
	if err := testPool.QueryRow(ctx, `
		INSERT INTO agent_task_queue (agent_id, runtime_id, chat_session_id, status, priority)
		VALUES ($1, $2, $3, 'queued', 0)
		RETURNING id
	`, agentID, runtimeID, sessionID).Scan(&taskID); err != nil {
		t.Fatalf("create managed chat task: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id = $1`, taskID)
		testPool.Exec(context.Background(), `DELETE FROM chat_message WHERE chat_session_id = $1`, sessionID)
		testPool.Exec(context.Background(), `DELETE FROM chat_session WHERE id = $1`, sessionID)
	})
	if _, err := testPool.Exec(ctx, `UPDATE agent_runtime SET daemon_id='managed-ws-daemon',provider='openagent',visibility='public' WHERE id=$1`, runtimeID); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		UPDATE agent SET runtime_mode='local',runtime_config='{}'::jsonb,custom_env='{}'::jsonb,
		custom_args='[]'::jsonb,disabled_runtime_skills='[]'::jsonb,
		composio_toolkit_allowlist='{}'::text[],thinking_level=NULL,service_tier=NULL,
		mcp_config=$2::jsonb,execution_policy_key='workspace_openagent_v1' WHERE id=$1
	`, agentID, managedpolicy.WorkspaceOpenAgentMCPConfig()); err != nil {
		t.Fatal(err)
	}

	identity := daemonws.ClientIdentity{
		DaemonID:     "managed-ws-daemon",
		Managed:      true,
		WorkspaceIDs: []string{"00000000-0000-0000-0000-000000000999", testWorkspaceID},
		RuntimeIDs:   []string{runtimeID},
	}
	body, _ := json.Marshal(map[string]any{
		"daemon_id":   "managed-ws-daemon",
		"runtime_ids": []string{runtimeID},
		"max_tasks":   1,
	})
	status, respBody, err := testHandler.DaemonRPCHandler(ctx, identity, "tasks.claim", body)
	if err != nil {
		t.Fatalf("DaemonRPCHandler: %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", status, string(respBody))
	}
	var resp batchClaimReceiptResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Tasks) != 1 || resp.Tasks[0].ID != taskID {
		t.Fatalf("claimed %+v, want task %s", resp.Tasks, taskID)
	}
	if !resp.Tasks[0].ManagedRuntime {
		t.Fatal("managed batch claim did not preserve managed_runtime isolation marker")
	}
	var capabilities struct {
		Tasks []struct {
			Agent *TaskAgentData `json:"agent"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(respBody, &capabilities); err != nil {
		t.Fatal(err)
	}
	if capabilities.Tasks[0].Agent == nil || !strings.Contains(string(capabilities.Tasks[0].Agent.McpConfig), "web_search") {
		t.Fatalf("managed chat claim omitted platform web capabilities: %s", respBody)
	}
	var storedProfile string
	if err := testPool.QueryRow(ctx, `SELECT mcp_config::text FROM agent WHERE id=$1`, agentID).Scan(&storedProfile); err != nil {
		t.Fatal(err)
	}
	var stored, expected any
	if err := json.Unmarshal([]byte(storedProfile), &stored); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(managedpolicy.WorkspaceOpenAgentMCPConfig(), &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored, expected) {
		t.Fatal("claim mutated the workspace MCP profile")
	}
}
