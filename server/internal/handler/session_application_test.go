package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func contractTestApplication(t *testing.T, peer, agent string) db.SessionApplication {
	t.Helper()
	kind, target := "member", peer
	if agent != "" {
		kind, target = "agent", agent
	}
	ctx := context.Background()
	args := db.GetTargetSessionApplicationParams{WorkspaceID: parseUUID(testWorkspaceID), TargetKind: kind, TargetID: parseUUID(target), ApplicationType: "contract_review"}
	row, err := testHandler.Queries.GetTargetSessionApplication(ctx, args)
	if err == nil {
		return row
	}
	config, _ := json.Marshal(service.ContractApplicationConfig{ServiceName: "Contract review", DefaultPriority: "normal", ContractTypes: []string{}})
	row, err = testHandler.Queries.CreateSessionApplication(ctx, db.CreateSessionApplicationParams{ID: parseUUID(uuid.NewString()), WorkspaceID: args.WorkspaceID, ApplicationType: args.ApplicationType, TargetKind: kind, TargetID: args.TargetID, Status: "enabled", Config: config, UpdatedBy: parseUUID(testUserID)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { testPool.Exec(context.Background(), "DELETE FROM session_application WHERE id=$1", row.ID) })
	return row
}

func applicationTestSave(t *testing.T, actor, id string, in service.SessionApplicationWrite) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	req := directTestRequest(t, actor, "", "POST", "/api/session-applications", in)
	req = withURLParam(req, "applicationId", id)
	testHandler.SaveSessionApplication(w, req)
	return w
}
func applicationTestList(t *testing.T, actor, target string) map[string]json.RawMessage {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.ListSessionApplications(w, directTestRequest(t, actor, "", "GET", "/api/session-applications"+target, nil))
	if w.Code != 200 {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	var out map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}
func TestSessionApplicationPublicAccessAndAdminConfiguration(t *testing.T) {
	peer := directTestMember(t)
	in := service.SessionApplicationWrite{TargetKind: "member", TargetID: peer, Status: "draft", Config: service.ContractApplicationConfig{ServiceName: "Legal review", DefaultPriority: "high", RequireBackground: true, ReviewInstructions: "Internal instruction"}}
	if w := applicationTestSave(t, peer, "", in); w.Code != 403 {
		t.Fatalf("member wrote config: %d", w.Code)
	}
	before := applicationTestList(t, peer, "")
	if string(before["can_manage"]) != "false" || string(before["applications"]) != "[\"conversation\",\"contract_review\"]" {
		t.Fatalf("catalog: %s", before)
	}
	w := applicationTestSave(t, testUserID, "", in)
	if w.Code != 200 {
		t.Fatalf("save: %d %s", w.Code, w.Body.String())
	}
	var row SessionApplicationResponse
	json.Unmarshal(w.Body.Bytes(), &row)
	t.Cleanup(func() { testPool.Exec(context.Background(), "DELETE FROM session_application WHERE id=$1", row.ID) })
	target := "?target_kind=member&target_id=" + peer
	if got := applicationTestList(t, testUserID, target); string(got["providers"]) != "[]" {
		t.Fatalf("draft available: %s", got)
	}
	in.Version = row.Version
	in.Status = "enabled"
	w = applicationTestSave(t, testUserID, row.ID, in)
	if w.Code != 200 {
		t.Fatalf("enable %d %s", w.Code, w.Body.String())
	}
	json.Unmarshal(w.Body.Bytes(), &row)
	got := applicationTestList(t, testUserID, target)
	var providers []SessionApplicationResponse
	json.Unmarshal(got["providers"], &providers)
	if len(providers) != 1 || providers[0].Config.ReviewInstructions != "" {
		t.Fatalf("private instructions leaked: %s", got)
	}
	own := applicationTestList(t, peer, "")
	var configs []SessionApplicationResponse
	json.Unmarshal(own["configurations"], &configs)
	if len(configs) != 1 || configs[0].Config.ReviewInstructions != "Internal instruction" {
		t.Fatalf("own config: %s", own)
	}
	if w := applicationTestSave(t, testUserID, "", in); w.Code != 409 {
		t.Fatalf("duplicate %d", w.Code)
	}
	in.Version = 1
	if w := applicationTestSave(t, testUserID, row.ID, in); w.Code != 409 {
		t.Fatalf("stale version %d", w.Code)
	}
}

func TestSessionApplicationPauseReplayAndFrozenRequirements(t *testing.T) {
	peer := directTestMember(t)
	contractTestStorage(t)
	application := contractTestApplication(t, peer, "")
	sid := uuid.NewString()
	contractTestCleanup(t, sid)
	if w := contractTestCreate(t, testUserID, peer, "", sid, "Frozen review"); w.Code != 201 {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE session_application SET status='paused', config=jsonb_set(config,'{require_focus}','true') WHERE id=$1`, application.ID); err != nil {
		t.Fatal(err)
	}
	if w := contractTestCreate(t, testUserID, peer, "", sid, "Frozen review"); w.Code != 200 {
		t.Fatalf("lost receipt replay after pause %d %s", w.Code, w.Body.String())
	}
	next := uuid.NewString()
	contractTestCleanup(t, next)
	if w := contractTestCreate(t, testUserID, peer, "", next, "Blocked new review"); w.Code != 403 {
		t.Fatalf("paused creation %d", w.Code)
	}
	var count int
	testPool.QueryRow(context.Background(), "SELECT count(*) FROM chat_session WHERE id=$1", next).Scan(&count)
	if count != 0 {
		t.Fatal("failed submission left a session")
	}
	review := contractTestGet(t, peer, sid)
	if review.Configuration == nil || review.Configuration.RequireFocus {
		t.Fatal("existing configuration snapshot changed")
	}
	if w := contractTestAction(t, peer, sid, uuid.NewString(), "request_info", "Add context", "", 1); w.Code != 200 {
		t.Fatalf("paused old request could not proceed %d", w.Code)
	}
}

func TestSessionApplicationRuntimeCapabilityDoesNotBlockOrdinaryConversation(t *testing.T) {
	ctx := context.Background()
	for _, id := range []string{uuid.NewString(), "00000000-0000-0000-0000-000000000000"} {
		ready, err := service.ContractRuntimeSupportsFiles(ctx, testHandler.Queries, parseUUID(id))
		if err != nil || ready {
			t.Fatalf("unregistered runtime supports files: ready=%v error=%v", ready, err)
		}
	}
	t.Run("mcp_only", func(t *testing.T) {
		ctx := context.Background()
		agentID := createHandlerTestAgent(t, "Unavailable contract runtime", []byte(`[]`))
		var runtimeID string
		if err := testPool.QueryRow(ctx, `INSERT INTO agent_runtime (workspace_id, name, runtime_mode, provider, status, owner_id)
			VALUES ($1, 'MCP-only review fixture', 'cloud', 'openagent', 'online', $2) RETURNING id`, testWorkspaceID, testUserID).Scan(&runtimeID); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { testPool.Exec(context.Background(), "DELETE FROM agent_runtime WHERE id=$1", runtimeID) })
		if _, err := testPool.Exec(ctx, "UPDATE agent SET runtime_id=$2 WHERE id=$1", agentID, runtimeID); err != nil {
			t.Fatal(err)
		}
		in := service.SessionApplicationWrite{TargetKind: "agent", TargetID: agentID, Status: "draft", Config: service.ContractApplicationConfig{ServiceName: "Contract review", DefaultPriority: "normal"}}
		w := applicationTestSave(t, testUserID, "", in)
		if w.Code != 200 {
			t.Fatalf("draft should remain configurable: %d %s", w.Code, w.Body.String())
		}
		var row SessionApplicationResponse
		if err := json.Unmarshal(w.Body.Bytes(), &row); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { testPool.Exec(context.Background(), "DELETE FROM session_application WHERE id=$1", row.ID) })
		in.Version, in.Status = row.Version, "enabled"
		if w = applicationTestSave(t, testUserID, row.ID, in); w.Code != 400 {
			t.Fatalf("unsupported runtime enabled: %d %s", w.Code, w.Body.String())
		}
		got := applicationTestList(t, testUserID, "?target_kind=agent&target_id="+agentID)
		if string(got["providers"]) != "[]" || string(got["applications"]) != "[\"conversation\",\"contract_review\"]" {
			t.Fatalf("ordinary conversation discovery changed: %s", got)
		}
		// A stale binding cannot bypass the submission capability check.
		if _, err := testPool.Exec(ctx, "UPDATE session_application SET status='enabled' WHERE id=$1", row.ID); err != nil {
			t.Fatal(err)
		}
		contractTestStorage(t)
		sid := uuid.NewString()
		contractTestCleanup(t, sid)
		w = contractTestCreate(t, testUserID, "", agentID, sid, "Unsupported review")
		if w.Code != 400 && w.Code != 403 {
			t.Fatalf("unsupported runtime submitted: %d %s", w.Code, w.Body.String())
		}
		var count int
		if err := testPool.QueryRow(ctx, "SELECT count(*) FROM chat_session WHERE id=$1", sid).Scan(&count); err != nil || count != 0 {
			t.Fatalf("rejected submission left a session: count=%d error=%v", count, err)
		}
	})
}

func TestContractSubmissionQueuesOnceAndScopesIntent(t *testing.T) {
	agent := createHandlerTestAgent(t, "Configured reviewer", []byte(`[]`))
	contractTestStorage(t)
	sid := uuid.NewString()
	contractTestCleanup(t, sid)
	if w := contractTestCreate(t, testUserID, "", agent, sid, "Structured review"); w.Code != 201 {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	if w := contractTestCreate(t, testUserID, "", agent, sid, "Structured review"); w.Code != 200 {
		t.Fatalf("replay %d", w.Code)
	}
	ctx := context.Background()
	task, err := testHandler.Queries.GetLatestContractTask(ctx, db.GetLatestContractTaskParams{WorkspaceID: parseUUID(testWorkspaceID), ReviewID: parseUUID(sid)})
	if err != nil {
		t.Fatal(err)
	}
	submission, err := testHandler.Queries.GetContractSubmissionByTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	var count int
	testPool.QueryRow(ctx, "SELECT count(*) FROM agent_task_queue WHERE chat_session_id=$1", sid).Scan(&count)
	if count != 1 {
		t.Fatalf("duplicate tasks %d", count)
	}
	testPool.QueryRow(ctx, "SELECT count(*) FROM chat_message WHERE chat_session_id=$1 AND role='user'", sid).Scan(&count)
	if count != 0 {
		t.Fatal("form forged a user message")
	}
	p := resolvedAssistantPrincipal{WorkspaceUUID: parseUUID(testWorkspaceID), ChatSessionUUID: parseUUID(sid), TaskUUID: task.ID, InputTaskUUID: task.ID, OriginatorUserUUID: parseUUID(testUserID)}
	action := assistantresource.ActionRequest{Resource: "contract_review", ResourceID: sid, UserIntentSubmissionID: uuidToString(submission.ID)}
	req := directTestRequest(t, testUserID, sid, "POST", "/execute", nil)
	w := httptest.NewRecorder()
	if !testHandler.validateAssistantSubmissionIntent(w, req, p, action) {
		t.Fatalf("real intent rejected %d %s", w.Code, w.Body.String())
	}
	action.Resource = "issue"
	w = httptest.NewRecorder()
	if testHandler.validateAssistantSubmissionIntent(w, req, p, action) || w.Code != 403 {
		t.Fatal("submission intent escaped resource scope")
	}
	var response AgentTaskResponse
	if err := testHandler.loadContractTaskInput(req, task, &response); err != nil || response.ContractSubmissionID == "" || response.ChatMessage == "" {
		t.Fatalf("task input %v %+v", err, response)
	}
	if w := contractTestAction(t, testUserID, sid, uuid.NewString(), "retry", "", "", 1); w.Code != 409 {
		t.Fatalf("running task retried %d", w.Code)
	}
	testPool.Exec(ctx, "UPDATE agent_task_queue SET status='failed' WHERE id=$1", task.ID)
	key := uuid.NewString()
	if w := contractTestAction(t, testUserID, sid, key, "retry", "", "", 1); w.Code != 200 {
		t.Fatalf("retry failed task %d %s", w.Code, w.Body.String())
	}
	if w := contractTestAction(t, testUserID, sid, key, "retry", "", "", 1); w.Code != 200 {
		t.Fatalf("retry replay %d", w.Code)
	}
	testPool.QueryRow(ctx, "SELECT count(*) FROM agent_task_queue WHERE chat_session_id=$1", sid).Scan(&count)
	if count != 2 {
		t.Fatalf("duplicate retry tasks %d", count)
	}
	action.Resource = "contract_review"
	w = httptest.NewRecorder()
	if testHandler.validateAssistantSubmissionIntent(w, req, p, action) {
		t.Fatal("superseded intent accepted")
	}
}

func TestContractSubmissionUsesNormalResourceGateway(t *testing.T) {
	agent := createHandlerTestAgent(t, "Gateway contract reviewer", []byte(`[]`))
	contractTestStorage(t)
	sid := uuid.NewString()
	contractTestCleanup(t, sid)
	if w := contractTestCreate(t, testUserID, "", agent, sid, "Gateway review"); w.Code != 201 {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	ctx := context.Background()
	task, err := testHandler.Queries.GetLatestContractTask(ctx, db.GetLatestContractTaskParams{WorkspaceID: parseUUID(testWorkspaceID), ReviewID: parseUUID(sid)})
	if err != nil {
		t.Fatal(err)
	}
	submission, err := testHandler.Queries.GetContractSubmissionByTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), "DELETE FROM assistant_operation WHERE chat_session_id=$1", sid)
	})
	for i, name := range []string{"accept", "start", "complete"} {
		version := int32(i + 1)
		input := map[string]any{}
		if name == "complete" {
			input["result"] = "Verified payment clause. Specify currency in clause 3."
		}
		action := assistantresource.ActionRequest{Resource: "contract_review", ResourceID: sid, Action: name, ExpectedVersion: &version, Input: input, IdempotencyKey: uuid.NewString(), Confirmed: true, UserIntentSubmissionID: uuidToString(submission.ID)}
		req := directTestRequest(t, testUserID, sid, "POST", "/execute", action)
		req.Header.Set("X-Actor-Source", "task_token")
		req.Header.Set("X-Task-ID", uuidToString(task.ID))
		w := httptest.NewRecorder()
		testHandler.ExecuteAssistantResourceAction(w, req)
		if w.Code != 200 {
			t.Fatalf("%s through gateway: %d %s", name, w.Code, w.Body.String())
		}
	}
	review := contractTestGet(t, testUserID, sid)
	if review.Status != "completed" || review.Result == "" {
		t.Fatalf("no saved result %+v", review)
	}
}

func TestContractHistoryBlocksRuntimeCleanup(t *testing.T) {
	agent := createHandlerTestAgent(t, "History reviewer", []byte(`[]`))
	contractTestStorage(t)
	sid := uuid.NewString()
	contractTestCleanup(t, sid)
	if w := contractTestCreate(t, testUserID, "", agent, sid, "Protected history"); w.Code != 201 {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	ctx := context.Background()
	a, err := testHandler.Queries.GetAgent(ctx, parseUUID(agent))
	if err != nil {
		t.Fatal(err)
	}
	testPool.Exec(ctx, "UPDATE agent SET archived_at=now() WHERE id=$1", agent)
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = pruneRuntimeContractReviews(ctx, testHandler.Queries.WithTx(tx), a.RuntimeID, false); !errors.Is(err, service.ErrContractConflict) {
		t.Fatalf("destructive cleanup accepted %v", err)
	}
	var count int
	testPool.QueryRow(ctx, "SELECT count(*) FROM contract_review_file WHERE review_id=$1", sid).Scan(&count)
	if count != 1 {
		t.Fatal("history files were removed")
	}
}
