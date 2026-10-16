package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	"github.com/iteamify-ai/iteamify/server/internal/storage"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
)

func contractTestStorage(t *testing.T) {
	t.Helper()
	t.Setenv("LOCAL_UPLOAD_DIR", t.TempDir())
	t.Setenv("LOCAL_UPLOAD_BASE_URL", "")
	original := testHandler.Storage
	testHandler.Storage = storage.NewLocalStorageFromEnv()
	t.Cleanup(func() { testHandler.Storage = original })
}
func contractTestCleanup(t *testing.T, sid string) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		for _, table := range []string{"contract_submission", "contract_review_file", "contract_review_action"} {
			if _, err := testPool.Exec(ctx, "DELETE FROM "+table+" WHERE review_id=$1", sid); err != nil {
				t.Error(err)
			}
		}
		if _, err := testPool.Exec(ctx, "DELETE FROM contract_review WHERE id=$1", sid); err != nil {
			t.Error(err)
		}
		testPool.Exec(ctx, "DELETE FROM agent_task_queue WHERE chat_session_id=$1", sid)
		testPool.Exec(ctx, "DELETE FROM chat_context_resource WHERE chat_session_id=$1", sid)
		testPool.Exec(ctx, "DELETE FROM chat_session WHERE id=$1", sid)
	})
}
func contractTestCreate(t *testing.T, actor, peer, agent, sid, title string) *httptest.ResponseRecorder {
	t.Helper()
	kind := "direct"
	if agent != "" {
		kind = "agent"
	}
	application := contractTestApplication(t, peer, agent)
	payload, _ := json.Marshal(map[string]any{"application_id": uuidToString(application.ID), "application_version": application.Version, "session_id": sid, "kind": kind, "peer_user_id": peer, "agent_id": agent, "fields": service.ContractReviewFields{Title: title, Priority: "normal", Background: "Purchase agreement", Focus: "Payment clause"}})
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	form.WriteField("request", string(payload))
	file, _ := form.CreateFormFile("files", "contract.txt")
	file.Write([]byte("Payment is due within 30 days."))
	form.Close()
	req := directTestRequest(t, actor, sid, "POST", "/api/contract-reviews", nil)
	req.Body = io.NopCloser(&buf)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("X-Client-Capabilities", "session-containers-v1")
	w := httptest.NewRecorder()
	testHandler.CreateContractReview(w, req)
	return w
}
func contractTestGet(t *testing.T, actor, sid string) ContractReviewResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.GetContractReview(w, directTestRequest(t, actor, sid, "GET", "/api/contract-reviews/"+sid, nil))
	if w.Code != 200 {
		t.Fatalf("get %d: %s", w.Code, w.Body.String())
	}
	var review ContractReviewResponse
	if err := json.Unmarshal(w.Body.Bytes(), &review); err != nil {
		t.Fatal(err)
	}
	return review
}
func contractTestAction(t *testing.T, actor, sid, key, action, note, result string, version int32) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.UpdateContractReview(w, directTestRequest(t, actor, sid, "POST", "/actions", service.ContractReviewUpdate{RequestKey: key, Version: version, Action: action, Note: note, Result: result}))
	return w
}

func TestContractReviewPrivateLifecycleAndIndependentUnread(t *testing.T) {
	peer, third := directTestMember(t), directTestMember(t)
	contractTestStorage(t)
	sid := uuid.NewString()
	contractTestCleanup(t, sid)
	var delivered []events.Event
	active := true
	testHandler.Bus.Subscribe(protocol.EventResourceChanged, func(e events.Event) {
		if active && e.ChatSessionID == sid {
			delivered = append(delivered, e)
		}
	})
	defer func() { active = false }()
	w := contractTestCreate(t, testUserID, peer, "", sid, "Payment review")
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	for _, secret := range []string{"encryption_key", "object_key", "submission_hash"} {
		if bytes.Contains(w.Body.Bytes(), []byte(secret)) {
			t.Fatalf("private metadata exposed: %s", secret)
		}
	}
	review := contractTestGet(t, peer, sid)
	if !review.HasUnread || review.Version != 1 || len(review.Files) != 1 {
		t.Fatalf("initial review: %+v", review)
	}
	if len(delivered) != 2 || delivered[0].RecipientUserID != testUserID || delivered[1].RecipientUserID != peer {
		t.Fatalf("delivery: %+v", delivered)
	}
	var count int
	if err := testPool.QueryRow(context.Background(), "SELECT count(*) FROM chat_message WHERE chat_session_id=$1", sid).Scan(&count); err != nil || count != 0 {
		t.Fatalf("submission created chat messages: %d %v", count, err)
	}
	if w = contractTestCreate(t, testUserID, peer, "", sid, "Payment review"); w.Code != 200 {
		t.Fatalf("retry: %d %s", w.Code, w.Body.String())
	}
	if w = contractTestCreate(t, testUserID, peer, "", sid, "Changed review"); w.Code != 409 {
		t.Fatalf("changed retry: %d", w.Code)
	}
	w = httptest.NewRecorder()
	testHandler.GetContractReview(w, directTestRequest(t, third, sid, "GET", "/review", nil))
	if w.Code != 404 {
		t.Fatalf("third participant: %d", w.Code)
	}
	w = httptest.NewRecorder()
	testHandler.GetChatSession(w, directTestRequest(t, peer, sid, "GET", "/session?kind=direct", nil))
	if w.Code != 426 {
		t.Fatalf("old client: %d", w.Code)
	}
	// Viewing the optional discussion cannot consume a domain notification.
	w = httptest.NewRecorder()
	testHandler.MarkChatSessionRead(w, directTestRequest(t, peer, sid, "POST", "/read?kind=direct", map[string]int{"sequence": 100}))
	if w.Code != 204 || !contractTestGet(t, peer, sid).HasUnread {
		t.Fatalf("chat read consumed business unread: %d", w.Code)
	}
	w = httptest.NewRecorder()
	testHandler.MarkContractReviewRead(w, directTestRequest(t, peer, sid, "POST", "/read", map[string]int{"version": 1}))
	if w.Code != 204 || contractTestGet(t, peer, sid).HasUnread {
		t.Fatal("business read not stored")
	}
	if w = contractTestAction(t, testUserID, sid, uuid.NewString(), "accept", "", "", 1); w.Code != 403 {
		t.Fatalf("requester accepted own review: %d", w.Code)
	}
	key := uuid.NewString()
	if w = contractTestAction(t, peer, sid, key, "accept", "", "", 1); w.Code != 200 {
		t.Fatalf("accept: %d %s", w.Code, w.Body.String())
	}
	if w = contractTestAction(t, peer, sid, key, "accept", "", "", 1); w.Code != 200 {
		t.Fatalf("action retry: %d %s", w.Code, w.Body.String())
	}
	if len(contractTestGet(t, peer, sid).Actions) != 1 {
		t.Fatal("action duplicated on retry")
	}
	if w = contractTestAction(t, peer, sid, uuid.NewString(), "start", "", "", 1); w.Code != 409 {
		t.Fatalf("stale version: %d", w.Code)
	}
	if w = contractTestAction(t, peer, sid, uuid.NewString(), "request_info", "Please clarify currency", "", 2); w.Code != 200 {
		t.Fatalf("request info: %d %s", w.Code, w.Body.String())
	}
	if !contractTestGet(t, testUserID, sid).HasUnread {
		t.Fatal("request info did not notify requester")
	}
	if w = contractTestAction(t, testUserID, sid, uuid.NewString(), "supplement", "USD", "", 3); w.Code != 200 {
		t.Fatalf("supplement: %d %s", w.Code, w.Body.String())
	}
	for i, action := range []string{"accept", "start", "complete"} {
		result := ""
		if action == "complete" {
			result = "Require a clearly defined payment currency and due date."
		}
		if w = contractTestAction(t, peer, sid, uuid.NewString(), action, "", result, int32(4+i)); w.Code != 200 {
			t.Fatalf("%s: %d %s", action, w.Code, w.Body.String())
		}
	}
	review = contractTestGet(t, testUserID, sid)
	if review.Status != "completed" || review.Result == "" || review.Version != 7 || !review.HasUnread {
		t.Fatalf("completed: %+v", review)
	}
	if w = contractTestAction(t, peer, sid, uuid.NewString(), "start", "", "", 7); w.Code != 403 {
		t.Fatalf("completed review mutated: %d", w.Code)
	}
	// Private encrypted storage remains unusable outside the authenticated route.
	f, err := testHandler.Queries.GetContractReviewFile(context.Background(), parseUUID(review.Files[0].ID))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := testHandler.Storage.GetReader(context.Background(), f.ObjectKey)
	if err != nil {
		t.Fatal(err)
	}
	encrypted, _ := io.ReadAll(raw)
	raw.Close()
	if bytes.Contains(encrypted, []byte("Payment is due")) {
		t.Fatal("public object contains plaintext")
	}
	for _, actor := range []string{peer, third} {
		w = httptest.NewRecorder()
		req := withURLParam(newRequestAs(actor, "GET", review.Files[0].DownloadURL, nil), "id", review.Files[0].ID)
		testHandler.DownloadContractReviewFile(w, req)
		if actor == peer && (w.Code != 200 || w.Body.String() != "Payment is due within 30 days.") {
			t.Fatalf("download: %d %s", w.Code, w.Body.String())
		}
		if actor == third && w.Code != 404 {
			t.Fatalf("third download: %d", w.Code)
		}
	}
	// Messages on the discussion retain the independent domain badge.
	req := directTestRequest(t, peer, sid, "POST", "/messages?kind=direct", map[string]string{"client_message_id": uuid.NewString(), "content": "Review saved"})
	req.Header.Set("X-Client-Capabilities", "session-containers-v1")
	w = httptest.NewRecorder()
	testHandler.SendChatMessage(w, req)
	if w.Code != 201 {
		t.Fatalf("discussion: %d %s", w.Code, w.Body.String())
	}
}

func TestContractReviewAgentTaskScopeAndContext(t *testing.T) {
	agent := createHandlerTestAgent(t, "Contract reviewer", []byte(`[]`))
	contractTestStorage(t)
	sid, other := uuid.NewString(), uuid.NewString()
	contractTestCleanup(t, sid)
	contractTestCleanup(t, other)
	for _, id := range []string{sid, other} {
		if w := contractTestCreate(t, testUserID, "", agent, id, "Agent review"); w.Code != 201 {
			t.Fatalf("create agent: %d %s", w.Code, w.Body.String())
		}
	}
	ctx := context.Background()
	refs, err := testHandler.Queries.ListChatContextResources(ctx, db.ListChatContextResourcesParams{WorkspaceID: parseUUID(testWorkspaceID), ChatSessionID: parseUUID(sid)})
	if err != nil || len(refs) != 1 || refs[0].ResourceType != "contract_review" || refs[0].ResourceID != sid {
		t.Fatalf("context: %+v %v", refs, err)
	}
	var taskID string
	err = testPool.QueryRow(ctx, `INSERT INTO agent_task_queue(agent_id,runtime_id,chat_session_id,status,originator_user_id,accountable_user_id,originator_source) VALUES($1,$2,$3,'running',$4,$4,'member') RETURNING id`, agent, handlerTestRuntimeID(t), sid, testUserID).Scan(&taskID)
	if err != nil {
		t.Fatal(err)
	}
	p := assistantresource.Principal{WorkspaceID: testWorkspaceID, TaskID: taskID, AgentID: agent, ChatSessionID: sid, OriginatorUserID: testUserID, Role: "owner"}
	adapter := newContractReviewAssistantResource(testHandler)
	if _, err = adapter.Get(ctx, p, sid); err != nil {
		t.Fatal(err)
	}
	if _, err = adapter.Get(ctx, p, other); !errors.Is(err, assistantresource.ErrForbidden) {
		t.Fatalf("cross session task: %v", err)
	}
	// Both the API file route and resource reads enforce the task's session.
	for _, id := range []string{sid, other} {
		record := contractTestGet(t, testUserID, id)
		w := httptest.NewRecorder()
		req := withURLParam(directTestRequest(t, testUserID, id, "GET", record.Files[0].DownloadURL, nil), "id", record.Files[0].ID)
		req.Header.Set("X-Actor-Source", "task_token")
		req.Header.Set("X-Task-ID", taskID)
		testHandler.DownloadContractReviewFile(w, req)
		if id == sid && w.Code != 200 {
			t.Fatalf("task download: %d %s", w.Code, w.Body.String())
		}
		if id == other && w.Code != 404 {
			t.Fatalf("cross session file: %d", w.Code)
		}
	}
	w := httptest.NewRecorder()
	req := directTestRequest(t, testUserID, sid, "DELETE", "/context", nil)
	chi.RouteContext(req.Context()).URLParams.Add("contextId", uuidToString(refs[0].ID))
	testHandler.DeleteChatContextResource(w, req)
	if w.Code != 409 {
		t.Fatalf("primary resource removed: %d", w.Code)
	}
	for i, name := range []string{"accept", "start", "complete"} {
		version := int32(i + 1)
		input := map[string]any{}
		if name == "complete" {
			input["result"] = "Payment due date verified against clause 3."
		}
		request := assistantresource.ActionRequest{Resource: "contract_review", ResourceID: sid, Action: name, ExpectedVersion: &version, Input: input, IdempotencyKey: uuid.NewString()}
		if _, err = adapter.Preview(ctx, p, request); err != nil {
			t.Fatal(err)
		}
		if _, err = adapter.Execute(ctx, p, request); err != nil {
			t.Fatal(err)
		}
	}
	review := contractTestGet(t, testUserID, sid)
	if review.Status != "completed" || !review.HasUnread {
		t.Fatalf("agent result: %+v", review)
	}
}

func TestContractReviewStorageFailureRollbackAndDeletion(t *testing.T) {
	agent := createHandlerTestAgent(t, "Contract cleanup", []byte(`[]`))
	contractTestStorage(t)
	sid := uuid.NewString()
	contractTestCleanup(t, sid)
	ctx := context.Background()
	original := testHandler.Storage
	testHandler.Storage = nil
	w := contractTestCreate(t, testUserID, "", agent, sid, "Transactional request")
	testHandler.Storage = original
	if w.Code != 500 {
		t.Fatalf("storage failure: %d", w.Code)
	}
	var count int
	if err := testPool.QueryRow(ctx, "SELECT count(*) FROM chat_session WHERE id=$1", sid).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial session: %d %v", count, err)
	}
	if w = contractTestCreate(t, testUserID, "", agent, sid, "Transactional request"); w.Code != 201 {
		t.Fatalf("retry after rollback: %d %s", w.Code, w.Body.String())
	}
	review := contractTestGet(t, testUserID, sid)
	f, err := testHandler.Queries.GetContractReviewFile(ctx, parseUUID(review.Files[0].ID))
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	testHandler.DeleteChatSession(w, directTestRequest(t, testUserID, sid, "DELETE", "/session", nil))
	if w.Code != 204 {
		t.Fatalf("delete: %d %s", w.Code, w.Body.String())
	}
	if _, err = testHandler.Queries.GetContractReview(ctx, db.GetContractReviewParams{ID: parseUUID(sid), WorkspaceID: parseUUID(testWorkspaceID)}); err == nil {
		t.Fatal("domain record survived session deletion")
	}
	if reader, err := testHandler.Storage.GetReader(ctx, f.ObjectKey); err == nil {
		reader.Close()
		t.Fatal("private file survived session deletion")
	}
}
