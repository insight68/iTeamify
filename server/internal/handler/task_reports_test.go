package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func createReportTestTask(t *testing.T) string {
	t.Helper()
	var taskID string
	if err := testPool.QueryRow(context.Background(), `
		INSERT INTO agent_task_queue (agent_id, runtime_id, status, priority, context, started_at)
		SELECT id, $2, 'running', 0, jsonb_build_object('type','quick_create','workspace_id',$1::text,'prompt','report regression'), now()
		FROM agent WHERE workspace_id=$1::uuid LIMIT 1 RETURNING id
	`, testWorkspaceID, testRuntimeID).Scan(&taskID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM task_message WHERE task_id=$1`, taskID)
		_, _ = testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id=$1`, taskID)
	})
	return taskID
}

func TestReportTaskMessagesIsAtomicAndIdempotent(t *testing.T) {
	useCloudRuntimeProxy(t, &fakeCloudRuntimeProxy{enabled: true})
	taskID := createReportTestTask(t)
	body := map[string]any{"messages": []map[string]any{
		{"seq": 1, "type": "text", "content": "complete answer"},
		{"seq": 2, "type": "tool_result", "tool": "lookup", "output": "nested tool output", "input": map[string]any{"limit": 2}},
	}}
	post := func(payload any) *httptest.ResponseRecorder {
		r := newDaemonTokenRequest(http.MethodPost, "/messages", payload, testWorkspaceID, "report-test")
		w := httptest.NewRecorder()
		testHandler.ReportTaskMessages(w, withURLParam(r, "taskId", taskID))
		return w
	}
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); responses <- post(body) }()
	}
	wg.Wait()
	close(responses)
	for w := range responses {
		if w.Code != http.StatusOK {
			t.Fatalf("replay response=%d %s", w.Code, w.Body.String())
		}
	}
	rows, err := testHandler.Queries.ListTaskMessages(context.Background(), parseUUID(taskID))
	if err != nil || len(rows) != 2 {
		t.Fatalf("rows=%v error=%v", rows, err)
	}
	conflict := post(map[string]any{"messages": []map[string]any{
		{"seq": 3, "type": "text", "content": "must roll back"},
		{"seq": 1, "type": "text", "content": "conflicting answer"},
	}})
	if conflict.Code != http.StatusConflict {
		t.Fatalf("conflict=%d %s", conflict.Code, conflict.Body.String())
	}
	rows, err = testHandler.Queries.ListTaskMessages(context.Background(), parseUUID(taskID))
	if err != nil || len(rows) != 2 {
		t.Fatalf("batch was partially committed: rows=%v error=%v", rows, err)
	}
}

func TestRecoverOrphanedTasksProtectsDurableTerminalReports(t *testing.T) {
	useCloudRuntimeProxy(t, &fakeCloudRuntimeProxy{enabled: true})
	protectedID, interruptedID := createReportTestTask(t), createReportTestTask(t)
	r := newDaemonTokenRequest(http.MethodPost, "/recover-orphans", map[string]any{"protected_task_ids": []string{protectedID}}, testWorkspaceID, "report-test")
	w := httptest.NewRecorder()
	testHandler.RecoverOrphanedTasks(w, withURLParam(r, "runtimeId", testRuntimeID))
	if w.Code != http.StatusOK {
		t.Fatalf("response=%d %s", w.Code, w.Body.String())
	}
	protected, err := testHandler.Queries.GetAgentTask(context.Background(), parseUUID(protectedID))
	if err != nil || protected.Status != "running" {
		t.Fatalf("protected task=%+v error=%v", protected, err)
	}
	interrupted, err := testHandler.Queries.GetAgentTask(context.Background(), parseUUID(interruptedID))
	if err != nil || interrupted.Status != "failed" {
		t.Fatalf("interrupted task=%+v error=%v", interrupted, err)
	}
	// The legacy empty protection list must still reclaim ordinary orphans.
	rows, err := testHandler.Queries.RecoverOrphanedTasksForRuntime(context.Background(), db.RecoverOrphanedTasksForRuntimeParams{
		RuntimeID: parseUUID(testRuntimeID), ProtectedTaskIds: nil,
	})
	if err != nil || len(rows) != 1 {
		t.Fatalf("legacy recovery rows=%v error=%v", rows, err)
	}
}
