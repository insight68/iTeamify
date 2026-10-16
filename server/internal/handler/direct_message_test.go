package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/internal/middleware"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
)

func directTestRequest(t *testing.T, userID, sessionID, method, path string, body any) *http.Request {
	t.Helper()
	req := withURLParam(newRequestAs(userID, method, path, body), "sessionId", sessionID)
	member, err := testHandler.Queries.GetMemberByUserAndWorkspace(context.Background(), db.GetMemberByUserAndWorkspaceParams{WorkspaceID: parseUUID(testWorkspaceID), UserID: parseUUID(userID)})
	if err != nil {
		t.Fatal(err)
	}
	return req.WithContext(middleware.SetMemberContext(req.Context(), testWorkspaceID, member))
}
func directTestMember(t *testing.T) string {
	t.Helper()
	if testHandler == nil {
		t.Skip("database not available")
	}
	id := createWorkspaceMemberUser(t, "Direct member", uuid.NewString()+"@direct.test")
	t.Cleanup(func() {
		if _, err := testPool.Exec(context.Background(), `DELETE FROM chat_session WHERE workspace_id=$1 AND kind='direct' AND (creator_id=$2 OR peer_user_id=$2)`, testWorkspaceID, id); err != nil {
			t.Error(err)
		}
	})
	return id
}
func createDirectForTest(t *testing.T, from, to, sid, cid, content string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.CreateChatSession(w, directTestRequest(t, from, sid, "POST", "/api/chat/sessions", map[string]string{"kind": "direct", "peer_user_id": to, "session_id": sid, "client_message_id": cid, "content": content}))
	return w
}
func sendDirectForTest(t *testing.T, from, sid, cid, content string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.SendChatMessage(w, directTestRequest(t, from, sid, "POST", "/api/chat/sessions/"+sid+"/messages?kind=direct", map[string]string{"client_message_id": cid, "content": content}))
	return w
}
func directPageForTest(t *testing.T, from, sid, query string) DirectMessagesPageResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.ListChatMessagesPage(w, directTestRequest(t, from, sid, "GET", "/messages/page?kind=direct"+query, nil))
	if w.Code != 200 {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	var page DirectMessagesPageResponse
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	return page
}
func TestDirectSessionsIdempotencyPrivacyAndReadCursor(t *testing.T) {
	other, third := directTestMember(t), directTestMember(t)
	sid, cid := uuid.NewString(), uuid.NewString()
	var delivered []events.Event
	active := true
	testHandler.Bus.Subscribe(protocol.EventDirectMessage, func(e events.Event) {
		if active {
			delivered = append(delivered, e)
		}
	})
	defer func() { active = false }()
	first := createDirectForTest(t, testUserID, other, sid, cid, "hello")
	if first.Code != 201 {
		t.Fatal(first.Body.String())
	}
	retry := createDirectForTest(t, testUserID, other, sid, cid, "hello")
	if retry.Code != 200 || retry.Body.String() != first.Body.String() {
		t.Fatalf("lost-response retry: %d %s", retry.Code, retry.Body.String())
	}
	if w := createDirectForTest(t, testUserID, other, sid, cid, "changed"); w.Code != 409 {
		t.Fatalf("key conflict: %d", w.Code)
	}
	if len(delivered) != 2 || delivered[0].RecipientUserID != testUserID || delivered[1].RecipientUserID != other || delivered[0].ChatSessionID != sid {
		t.Fatalf("private delivery: %+v", delivered)
	}
	w := httptest.NewRecorder()
	testHandler.ListChatMessagesPage(w, directTestRequest(t, third, sid, "GET", "/page?kind=direct", nil))
	if w.Code != 403 {
		t.Fatalf("third party accessed session: %d", w.Code)
	}
	page := directPageForTest(t, other, sid, "")
	if len(page.Messages) != 1 || page.ReadSequence != 0 {
		t.Fatalf("receiver: %+v", page)
	}
	for _, seq := range []int{100, 0} {
		w = httptest.NewRecorder()
		testHandler.MarkChatSessionRead(w, directTestRequest(t, other, sid, "POST", "/read?kind=direct", map[string]int{"sequence": seq}))
		if w.Code != 204 {
			t.Fatal(w.Body.String())
		}
	}
	if page = directPageForTest(t, other, sid, ""); page.ReadSequence != 1 {
		t.Fatalf("read cursor regressed: %+v", page)
	}
	if w = sendDirectForTest(t, other, sid, uuid.NewString(), "reply"); w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	if page = directPageForTest(t, testUserID, sid, "&limit=1"); len(page.Messages) != 1 || !page.HasMore || page.Messages[0].Sequence != 2 {
		t.Fatalf("latest page: %+v", page)
	}
	if page = directPageForTest(t, testUserID, sid, "&limit=1&before=2"); len(page.Messages) != 1 || page.HasMore || page.Messages[0].Content != "hello" {
		t.Fatalf("older page: %+v", page)
	}
	// Agent-only routes must never mutate or execute a direct session.
	for _, call := range []func(http.ResponseWriter, *http.Request){testHandler.SetChatSessionArchived, testHandler.SetChatSessionPinned, testHandler.DeleteChatSession, testHandler.ListChatDraftRestores, testHandler.GetPendingChatTask} {
		w = httptest.NewRecorder()
		call(w, directTestRequest(t, testUserID, sid, "POST", "/agent-only", map[string]bool{"archived": true, "pinned": true}))
		if w.Code < 400 {
			t.Fatalf("agent operation accepted direct session: %d", w.Code)
		}
	}
}
func TestDirectSessionsConcurrentRetriesAndMultipleSessions(t *testing.T) {
	other := directTestMember(t)
	sid, cid := uuid.NewString(), uuid.NewString()
	const count = 16
	requests := make([]*http.Request, count)
	for i := range requests {
		requests[i] = directTestRequest(t, testUserID, sid, "POST", "/api/chat/sessions", map[string]string{"kind": "direct", "peer_user_id": other, "session_id": sid, "client_message_id": cid, "content": "once"})
	}
	var wg sync.WaitGroup
	codes := make([]int, count)
	for i, req := range requests {
		wg.Add(1)
		go func(i int, r *http.Request) {
			defer wg.Done()
			w := httptest.NewRecorder()
			testHandler.CreateChatSession(w, r)
			codes[i] = w.Code
		}(i, req)
	}
	wg.Wait()
	created := 0
	for _, code := range codes {
		if code == 201 {
			created++
		} else if code != 200 {
			t.Fatalf("concurrent create: %d", code)
		}
	}
	if created != 1 {
		t.Fatalf("created %d sessions", created)
	}
	requests = []*http.Request{directTestRequest(t, testUserID, sid, "POST", "/messages?kind=direct", map[string]string{"content": "a", "client_message_id": uuid.NewString()}), directTestRequest(t, other, sid, "POST", "/messages?kind=direct", map[string]string{"content": "b", "client_message_id": uuid.NewString()})}
	for _, req := range requests {
		wg.Add(1)
		go func(r *http.Request) {
			defer wg.Done()
			w := httptest.NewRecorder()
			testHandler.SendChatMessage(w, r)
			if w.Code != 201 {
				t.Errorf("concurrent send: %d %s", w.Code, w.Body.String())
			}
		}(req)
	}
	wg.Wait()
	if page := directPageForTest(t, testUserID, sid, ""); len(page.Messages) != 3 || page.Messages[2].Sequence != 3 {
		t.Fatalf("sequence: %+v", page)
	}
	second := uuid.NewString()
	if w := createDirectForTest(t, other, testUserID, second, uuid.NewString(), "another topic"); w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	if page := directPageForTest(t, testUserID, second, ""); len(page.Messages) != 1 || page.Messages[0].Sequence != 1 {
		t.Fatalf("sessions mixed: %+v", page)
	}
	w := httptest.NewRecorder()
	testHandler.ListChatSessions(w, directTestRequest(t, testUserID, "", "GET", "/api/chat/sessions?kind=direct&peer_user_id="+other+"&limit=1", nil))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var list struct {
		Sessions   []DirectSessionResponse `json:"sessions"`
		NextCursor *string                 `json:"next_cursor"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Sessions) != 1 || list.Sessions[0].ID != second || list.NextCursor == nil {
		t.Fatalf("scoped list: %+v", list)
	}
	w = httptest.NewRecorder()
	testHandler.ListChatSessions(w, directTestRequest(t, testUserID, "", "GET", "/api/chat/sessions?kind=direct&peer_user_id="+other+"&limit=1&cursor="+*list.NextCursor, nil))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Sessions) != 1 || list.Sessions[0].ID != sid {
		t.Fatalf("cursor: %+v", list)
	}
}
func TestDirectSessionsRejectMachineSelfAndRemovedMember(t *testing.T) {
	other := directTestMember(t)
	sid := uuid.NewString()
	if w := createDirectForTest(t, testUserID, other, sid, uuid.NewString(), "before leaving"); w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	for _, source := range []string{"task_token", "cloud_pat"} {
		req := directTestRequest(t, testUserID, sid, "GET", "/page?kind=direct", nil)
		req.Header.Set("X-Actor-Source", source)
		w := httptest.NewRecorder()
		testHandler.ListChatMessagesPage(w, req)
		if w.Code != 403 {
			t.Fatalf("machine read: %d", w.Code)
		}
	}
	if w := createDirectForTest(t, testUserID, testUserID, uuid.NewString(), uuid.NewString(), "self"); w.Code != 400 {
		t.Fatalf("self: %d", w.Code)
	}
	removed := directTestRequest(t, other, sid, "GET", "/page?kind=direct", nil)
	if _, err := testPool.Exec(context.Background(), `DELETE FROM member WHERE workspace_id=$1 AND user_id=$2`, testWorkspaceID, other); err != nil {
		t.Fatal(err)
	}
	if w := sendDirectForTest(t, testUserID, sid, uuid.NewString(), "after leaving"); w.Code != 403 {
		t.Fatalf("removed target send: %d", w.Code)
	}
	w := httptest.NewRecorder()
	testHandler.ListChatMessagesPage(w, removed)
	if w.Code != 403 {
		t.Fatalf("cached membership bypass: %d", w.Code)
	}
	if page := directPageForTest(t, testUserID, sid, ""); page.CanSend || len(page.Messages) != 1 {
		t.Fatalf("remaining participant history: %+v", page)
	}
}
func TestDirectSessionsWorkspaceIsolation(t *testing.T) {
	other := directTestMember(t)
	sid := uuid.NewString()
	if w := createDirectForTest(t, testUserID, other, sid, uuid.NewString(), "private"); w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	ctx := context.Background()
	var wid string
	if err := testPool.QueryRow(ctx, `INSERT INTO workspace(name,slug,description) VALUES('Isolation',$1,'') RETURNING id`, uuid.NewString()).Scan(&wid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM workspace WHERE id=$1`, wid) })
	if _, err := testPool.Exec(ctx, `INSERT INTO member(workspace_id,user_id,role) VALUES($1,$2,'owner')`, wid, testUserID); err != nil {
		t.Fatal(err)
	}
	member, err := testHandler.Queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{WorkspaceID: parseUUID(wid), UserID: parseUUID(testUserID)})
	if err != nil {
		t.Fatal(err)
	}
	req := directTestRequest(t, testUserID, sid, "GET", "/page?kind=direct", nil)
	req = req.WithContext(middleware.SetMemberContext(req.Context(), wid, member))
	w := httptest.NewRecorder()
	testHandler.ListChatMessagesPage(w, req)
	if w.Code != 404 {
		t.Fatalf("cross-workspace read: %d", w.Code)
	}
}
func TestTeamActivityUsesMessagesAndResumesActiveSession(t *testing.T) {
	agent := createHandlerTestAgent(t, "Team activity", []byte("[]"))
	old := createHandlerTestChatSession(t, agent)
	recent := createHandlerTestChatSession(t, agent)
	archived := createHandlerTestChatSession(t, agent)
	times := []time.Time{time.Now().Add(-3 * time.Hour), time.Now().Add(-2 * time.Hour), time.Now().Add(-time.Hour)}
	for i, id := range []string{old, recent, archived} {
		if _, err := testPool.Exec(context.Background(), `INSERT INTO chat_message(chat_session_id,role,content,created_at) VALUES($1,'user','hi',$2)`, id, times[i]); err != nil {
			t.Fatal(err)
		}
	}
	testPool.Exec(context.Background(), `UPDATE chat_session SET status='archived' WHERE id=$1`, archived)
	testPool.Exec(context.Background(), `UPDATE chat_session SET title='Renamed',updated_at=now() WHERE id=$1`, old)
	w := httptest.NewRecorder()
	testHandler.ListTeamActivity(w, directTestRequest(t, testUserID, uuid.NewString(), "GET", "/api/team/activity", nil))
	if w.Code != 200 {
		t.Fatalf("activity: %d %s", w.Code, w.Body.String())
	}
	var activity []TeamActivityResponse
	if err := json.Unmarshal(w.Body.Bytes(), &activity); err != nil {
		t.Fatal(err)
	}
	for _, a := range activity {
		if a.TargetID == agent {
			if a.ResumeSessionID == nil || *a.ResumeSessionID != recent {
				t.Fatalf("wrong resume: %+v", a)
			}
			got, err := time.Parse(time.RFC3339Nano, *a.LastContactAt)
			if err != nil || got.Sub(times[2]).Abs() > time.Millisecond {
				t.Fatalf("activity used metadata timestamp: %+v", a)
			}
			return
		}
	}
	t.Fatal("agent missing from activity")
}
