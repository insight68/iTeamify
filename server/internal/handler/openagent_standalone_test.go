package handler

import (
	"context"
	"encoding/json"
	"github.com/iteamify-ai/iteamify/server/internal/managedpolicy"
	"github.com/iteamify-ai/iteamify/server/internal/middleware"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAgentStandaloneRegistrationAuthoredAgentAndChatClaim(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	h := *testHandler
	daemonID := "00000000-0000-4000-8000-000000000076"
	h.cfg.ManagedDaemonID = daemonID
	if _, err := h.Queries.UpsertWorkspaceOpenAgentConfig(ctx, db.UpsertWorkspaceOpenAgentConfigParams{WorkspaceID: parseUUID(testWorkspaceID), BaseUrl: "https://model.example.com/anthropic", Model: "deployment-model", ApiKeyEncrypted: []byte("ciphertext"), UpdatedBy: parseUUID(testUserID)}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(ctx, `DELETE FROM workspace_openagent_config WHERE workspace_id=$1`, testWorkspaceID)
	})
	t.Cleanup(func() {
		_, _ = testPool.Exec(ctx, `DELETE FROM agent_runtime WHERE workspace_id=$1 AND daemon_id=$2`, testWorkspaceID, daemonID)
	})
	w := httptest.NewRecorder()
	req := newRequest(http.MethodPost, "/api/daemon/register", map[string]any{"workspace_id": testWorkspaceID, "daemon_id": daemonID, "runtimes": []map[string]string{{"name": "OpenAgent", "type": "openagent", "status": "online"}}})
	req = req.WithContext(middleware.WithManagedDaemonContext(req.Context(), daemonID))
	h.DaemonRegister(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("register=%d %s", w.Code, w.Body.String())
	}
	var registered struct {
		Runtimes []AgentRuntimeResponse `json:"runtimes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &registered); err != nil {
		t.Fatal(err)
	}
	if len(registered.Runtimes) != 1 || !registered.Runtimes[0].SystemRuntime {
		t.Fatalf("runtimes=%#v", registered.Runtimes)
	}
	runtimeID := registered.Runtimes[0].ID
	w = httptest.NewRecorder()
	h.CreateAgent(w, newRequest(http.MethodPost, "/api/agents", map[string]any{"name": "Standalone OpenAgent", "runtime_id": runtimeID, "instructions": "Use read-only workspace resources."}))
	if w.Code != http.StatusCreated {
		t.Fatalf("create agent=%d %s", w.Code, w.Body.String())
	}
	var created AgentResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = testPool.Exec(ctx, `DELETE FROM agent WHERE id=$1`, created.ID) })
	stored, err := h.Queries.GetAgent(ctx, parseUUID(created.ID))
	if err != nil {
		t.Fatal(err)
	}
	if stored.ExecutionPolicyKey != managedpolicy.ExecutionPolicyWorkspaceOpenAgentV1 {
		t.Fatal("system policy missing")
	}
	var sessionID, taskID string
	if err = testPool.QueryRow(ctx, `INSERT INTO chat_session(workspace_id,agent_id,creator_id,title,status,runtime_id,is_agent_intro) VALUES ($1,$2,$3,'Intro','active',$4,true) RETURNING id`, testWorkspaceID, created.ID, testUserID, runtimeID).Scan(&sessionID); err != nil {
		t.Fatal(err)
	}
	if err = testPool.QueryRow(ctx, `INSERT INTO agent_task_queue(agent_id,runtime_id,status,priority,chat_session_id) VALUES ($1,$2,'queued',0,$3) RETURNING id`, created.ID, runtimeID, sessionID).Scan(&taskID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(ctx, `DELETE FROM agent_task_queue WHERE id=$1`, taskID)
		_, _ = testPool.Exec(ctx, `DELETE FROM chat_session WHERE id=$1`, sessionID)
	})
	task, err := h.Queries.GetAgentTask(ctx, parseUUID(taskID))
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := h.Queries.GetAgentRuntime(ctx, parseUUID(runtimeID))
	if err != nil {
		t.Fatal(err)
	}
	claimReq := newRequest(http.MethodPost, "/api/daemon/claim", nil)
	response, _, _, _, failure := h.buildClaimedTaskResponse(claimReq, &task, runtime, runtimeID, testWorkspaceID)
	if failure != nil || !response.ManagedRuntime || response.Agent == nil {
		t.Fatalf("claim rejected: %#v", failure)
	}
	encoded, _ := json.Marshal(response)
	if strings.Contains(string(encoded), "provisioning") || strings.Contains(string(encoded), "managed_health_check") {
		t.Fatal("initializer entered normal chat claim")
	}
	result := h.workspaceModelListRequest(ctx, db.AgentRuntime{Provider: "openagent", WorkspaceID: parseUUID(testWorkspaceID)})
	if len(result.Models) != 1 || result.Models[0].ID != "deployment-model" {
		t.Fatalf("model catalog=%#v", result)
	}
}
