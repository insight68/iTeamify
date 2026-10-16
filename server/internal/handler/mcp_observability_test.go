package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func TestRecordManagedAgentMCPToolInvocationRejectsHumanActor(t *testing.T) {
	w := httptest.NewRecorder()
	testHandler.RecordManagedAgentMCPToolInvocation(w, newRequest(
		http.MethodPost,
		"/api/mcp/tool-invocations",
		map[string]any{
			"invocation_id": uuid.NewString(),
			"tool_name":     "resource_catalog",
			"succeeded":     true,
			"duration_ms":   12,
		},
	))
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestOpenAgentMCPInvocationIsIdempotentWithoutProvisioning(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	agentID := createHandlerTestAgent(t, "mcp-observability-agent", []byte(`{}`))
	var taskID string
	if err := testPool.QueryRow(ctx, `
INSERT INTO agent_task_queue (agent_id, runtime_id, status, priority)
VALUES ($1, $2, 'running', 0)
RETURNING id
`, agentID, handlerTestRuntimeID(t)).Scan(&taskID); err != nil {
		t.Fatal(err)
	}
	invocationID := uuid.NewString()
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM mcp_tool_invocation WHERE id = $1`, invocationID)
		_, _ = testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id = $1`, taskID)

	})

	for range 2 {
		w := httptest.NewRecorder()
		req := newRequest(http.MethodPost, "/api/mcp/tool-invocations", map[string]any{
			"invocation_id": invocationID,
			"tool_name":     "resource_catalog",
			"succeeded":     true,
			"duration_ms":   42,
		})
		req.Header.Set("X-Actor-Source", "task_token")
		req.Header.Set("X-Agent-ID", agentID)
		req.Header.Set("X-Task-ID", taskID)
		testHandler.RecordManagedAgentMCPToolInvocation(w, req)
		if w.Code != http.StatusNoContent {
			t.Fatalf("record status = %d, body = %s", w.Code, w.Body.String())
		}
	}

	var invocationCount int
	if err := testPool.QueryRow(ctx, `SELECT COUNT(*) FROM mcp_tool_invocation WHERE id = $1`, invocationID).Scan(&invocationCount); err != nil {
		t.Fatal(err)
	}
	if invocationCount != 1 {
		t.Fatalf("invocation count = %d, want 1", invocationCount)
	}

}
