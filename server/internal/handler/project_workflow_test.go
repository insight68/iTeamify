package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func workflowTestProject(t *testing.T) ProjectResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.CreateProject(w, newRequest("POST", "/api/projects", map[string]any{"title": "Workflow acceptance test", "description": "Produce a report", "acceptance_criteria": "A complete report with sources"}))
	if w.Code != 201 {
		t.Fatalf("create project: %d %s", w.Code, w.Body.String())
	}
	var p ProjectResponse
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		testHandler.DeleteProject(httptest.NewRecorder(), withURLParam(newRequest("DELETE", "/api/projects/"+p.ID, nil), "id", p.ID))
	})
	return p
}

func workflowTestRead(t *testing.T, id string) ProjectWorkflowResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.GetProjectWorkflow(w, withURLParam(directTestRequest(t, testUserID, "", "GET", "/api/projects/"+id+"/workflow", nil), "id", id))
	if w.Code != 200 {
		t.Fatalf("read workflow: %d %s", w.Code, w.Body.String())
	}
	var result ProjectWorkflowResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func workflowTestAction(t *testing.T, id, user string, input map[string]any, status int) ProjectWorkflowResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.ProjectWorkflowAction(w, withURLParam(directTestRequest(t, user, "", "POST", "/api/projects/"+id+"/workflow", input), "id", id))
	if w.Code != status {
		t.Fatalf("action %s: %d %s; want %d", input["action"], w.Code, w.Body.String(), status)
	}
	var result ProjectWorkflowResponse
	if status == 200 {
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
	}
	return result
}

func TestProjectWorkflowHumanLifecycle(t *testing.T) {
	executor := directTestMember(t)
	intruder := directTestMember(t)
	p := workflowTestProject(t)
	flow := workflowTestRead(t, p.ID)
	if flow.WorkflowStatus != "planned" || !flow.CanManage || flow.AcceptanceCriteria == "" {
		t.Fatalf("invalid initial workflow: %+v", flow)
	}
	workflowTestAction(t, p.ID, intruder, map[string]any{"action": "assign", "version": flow.Version, "assignee_type": "member", "assignee_id": executor}, 403)
	flow = workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "assign", "version": flow.Version, "assignee_type": "member", "assignee_id": executor}, 200)
	if flow.WorkflowStatus != "in_progress" {
		t.Fatal(flow.WorkflowStatus)
	}
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "assign", "version": 1, "assignee_type": "member", "assignee_id": executor}, 409)
	workflowTestAction(t, p.ID, intruder, map[string]any{"action": "submit", "version": flow.Version, "result": "Unauthorized"}, 403)
	workflowTestAction(t, p.ID, executor, map[string]any{"action": "submit", "version": flow.Version}, 400)
	flow = workflowTestAction(t, p.ID, executor, map[string]any{"action": "submit", "version": flow.Version, "result": "First report"}, 200)
	workflowTestAction(t, p.ID, executor, map[string]any{"action": "approve", "version": flow.Version, "result": flow.Result}, 403)
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "reject", "version": flow.Version}, 400)
	flow = workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "reject", "version": flow.Version, "note": "Add sources"}, 200)
	if flow.WorkflowStatus != "in_progress" || flow.Result != "" || flow.ReviewNote != "Add sources" {
		t.Fatalf("invalid rejection: %+v", flow)
	}
	flow = workflowTestAction(t, p.ID, executor, map[string]any{"action": "submit", "version": flow.Version, "result": "Report with sources"}, 200)
	flow = workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "approve", "version": flow.Version, "note": "Meets the criteria", "result": flow.Result}, 200)
	if flow.WorkflowStatus != "completed" || flow.Status != "completed" || flow.Result != "Report with sources" {
		t.Fatalf("invalid acceptance: %+v", flow)
	}
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "approve", "version": flow.Version, "result": flow.Result}, 409)
}

func TestProjectWorkflowCannotBypassAcceptance(t *testing.T) {
	w := httptest.NewRecorder()
	testHandler.CreateProject(w, newRequest("POST", "/api/projects", map[string]any{"title": "Skip acceptance", "status": "completed"}))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("created an already accepted project: %d", w.Code)
	}
	p := workflowTestProject(t)
	w = httptest.NewRecorder()
	testHandler.UpdateProject(w, withURLParam(newRequest("PUT", "/api/projects/"+p.ID, map[string]any{"status": "completed"}), "id", p.ID))
	if w.Code != http.StatusConflict {
		t.Fatalf("bypass completion: %d %s", w.Code, w.Body.String())
	}
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "approve", "version": 1}, 409)
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "assign", "version": 1, "assignee_type": "member", "assignee_id": "invalid-uuid"}, 400)
	flow := workflowTestRead(t, p.ID)
	if flow.WorkflowStatus != "planned" || flow.Version != 1 {
		t.Fatal("invalid assignment changed the project")
	}
	count, err := testHandler.Queries.CountIssuesByProject(t.Context(), parseUUID(p.ID))
	if err != nil || count != 0 {
		t.Fatalf("invalid assignment created execution: %d %v", count, err)
	}
}

func TestProjectWorkflowProtectsItsExecution(t *testing.T) {
	p := workflowTestProject(t)
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "assign", "version": 1, "assignee_type": "member", "assignee_id": testUserID}, 200)
	flow, err := testHandler.Queries.GetProjectWorkflow(t.Context(), parseUUID(p.ID))
	if err != nil {
		t.Fatal(err)
	}
	id := uuidToString(flow.ExecutionIssueID)
	w := httptest.NewRecorder()
	testHandler.DeleteIssue(w, withURLParam(newRequest("DELETE", "/api/issues/"+id, nil), "id", id))
	if w.Code != 409 {
		t.Fatalf("deleted project execution: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	testHandler.UpdateIssue(w, withURLParam(newRequest("PUT", "/api/issues/"+id, map[string]any{"assignee_id": nil, "assignee_type": nil}), "id", id))
	if w.Code != 409 {
		t.Fatalf("changed project assignment: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	testHandler.BatchDeleteIssues(w, newRequest("POST", "/api/issues/batch/delete", map[string]any{"issue_ids": []string{id}}))
	if w.Code != 200 || w.Body.String() != "{\"deleted\":0}\n" {
		t.Fatalf("batch deleted project execution: %d %s", w.Code, w.Body.String())
	}
}

func TestProjectWorkflowExecutionCompletionWaitsForReview(t *testing.T) {
	p := workflowTestProject(t)
	flow := workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "assign", "version": 1, "assignee_type": "member", "assignee_id": testUserID}, 200)
	stored, err := testHandler.Queries.GetProjectWorkflow(t.Context(), parseUUID(p.ID))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testHandler.Queries.UpdateIssueStatus(t.Context(), db.UpdateIssueStatusParams{ID: stored.ExecutionIssueID, WorkspaceID: parseUUID(testWorkspaceID), Status: "done"}); err != nil {
		t.Fatal(err)
	}
	flow = workflowTestRead(t, p.ID)
	if flow.WorkflowStatus != "in_review" || flow.Status == "completed" {
		t.Fatalf("execution bypassed acceptance: %+v", flow)
	}
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "approve", "version": flow.Version}, 409)
}

func TestProjectWorkflowAgentDispatchAndReviewedSnapshot(t *testing.T) {
	ctx := context.Background()
	runtimeID := createClaimReclaimRuntime(t, ctx, "Workflow fake runtime")
	var agentID string
	if err := testPool.QueryRow(ctx, `INSERT INTO agent (workspace_id, name, runtime_mode, runtime_config, runtime_id, visibility, max_concurrent_tasks, owner_id) VALUES ($1, 'Workflow agent', 'cloud', '{}'::jsonb, $2, 'private', 1, $3) RETURNING id`, testWorkspaceID, runtimeID, testUserID).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM agent WHERE id=$1`, agentID) })
	p := workflowTestProject(t)
	flow := workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "assign", "version": 1, "assignee_type": "agent", "assignee_id": agentID}, 200)
	stored, err := testHandler.Queries.GetProjectWorkflow(ctx, parseUUID(p.ID))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM agent_task_queue WHERE issue_id=$1`, stored.ExecutionIssueID) })
	tasks, err := testHandler.Queries.ListTasksByIssue(ctx, stored.ExecutionIssueID)
	if err != nil || len(tasks) != 1 {
		t.Fatalf("assignment must enqueue exactly one task: %d %v", len(tasks), err)
	}
	if !flow.ExecutionActive {
		t.Fatal("queued execution was not reported")
	}
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "retry", "version": flow.Version}, 409)
	if _, err := testPool.Exec(ctx, `UPDATE agent_task_queue SET status='completed' WHERE issue_id=$1`, stored.ExecutionIssueID); err != nil {
		t.Fatal(err)
	}
	comment, err := testHandler.Queries.CreateComment(ctx, db.CreateCommentParams{IssueID: stored.ExecutionIssueID, WorkspaceID: parseUUID(testWorkspaceID), AuthorType: "agent", AuthorID: parseUUID(agentID), Content: "Agent report v1", Type: "comment"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testHandler.Queries.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{ID: stored.ExecutionIssueID, WorkspaceID: parseUUID(testWorkspaceID), Status: "done"}); err != nil {
		t.Fatal(err)
	}
	flow = workflowTestRead(t, p.ID)
	if flow.WorkflowStatus != "in_review" || flow.Result != "Agent report v1" {
		t.Fatalf("agent deliverable missing: %+v", flow)
	}
	if _, err := testPool.Exec(ctx, `UPDATE comment SET content='Agent report v2' WHERE id=$1`, comment.ID); err != nil {
		t.Fatal(err)
	}
	workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "approve", "version": flow.Version, "result": flow.Result}, 409)
	flow = workflowTestRead(t, p.ID)
	flow = workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "reject", "version": flow.Version, "note": "Provide source links"}, 200)
	if flow.Result != "" || !flow.ExecutionActive {
		t.Fatal("rejection did not restart execution")
	}
	if _, err := testPool.Exec(ctx, `UPDATE agent_task_queue SET status='completed' WHERE issue_id=$1`, stored.ExecutionIssueID); err != nil {
		t.Fatal(err)
	}
	if _, err := testHandler.Queries.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{ID: stored.ExecutionIssueID, WorkspaceID: parseUUID(testWorkspaceID), Status: "in_review"}); err != nil {
		t.Fatal(err)
	}
	flow = workflowTestRead(t, p.ID)
	if flow.Result != "" {
		t.Fatal("rejected deliverable was reused")
	}
	if _, err := testHandler.Queries.CreateComment(ctx, db.CreateCommentParams{IssueID: stored.ExecutionIssueID, WorkspaceID: parseUUID(testWorkspaceID), AuthorType: "agent", AuthorID: parseUUID(agentID), Content: "Report with source links", Type: "comment"}); err != nil {
		t.Fatal(err)
	}
	flow = workflowTestRead(t, p.ID)
	flow = workflowTestAction(t, p.ID, testUserID, map[string]any{"action": "approve", "version": flow.Version, "result": flow.Result}, 200)
	if flow.WorkflowStatus != "completed" || flow.Result != "Report with source links" {
		t.Fatalf("invalid accepted result: %+v", flow)
	}
}
