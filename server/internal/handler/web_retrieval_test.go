package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/iteamify-ai/iteamify/server/internal/service"
)

func TestWebRetrievalRequiresHumanOriginatedTaskAndCurrentMembership(t *testing.T) {
	for _, fn := range []func(http.ResponseWriter, *http.Request){testHandler.SearchCurrentTaskWeb, testHandler.FetchCurrentTaskWeb} {
		rec := httptest.NewRecorder()
		fn(rec, newRequest(http.MethodPost, "/api/chat/web/search", map[string]any{"query": "test"}))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("human status = %d", rec.Code)
		}
	}
	agentID := createHandlerTestAgent(t, "web-tool-agent", []byte(`{}`))
	var taskID string
	if err := testPool.QueryRow(context.Background(), `INSERT INTO agent_task_queue (agent_id,runtime_id,status,priority,originator_user_id,accountable_user_id,originator_source) VALUES ($1,$2,'running',0,$3,$3,'user') RETURNING id`, agentID, handlerTestRuntimeID(t), testUserID).Scan(&taskID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id=$1`, taskID) })
	previous := testHandler.WebRetrieval
	testHandler.WebRetrieval = service.NewWebRetrievalService("")
	t.Cleanup(func() { testHandler.WebRetrieval = previous })
	call := func() *httptest.ResponseRecorder {
		req := withChatTestWorkspaceCtx(t, newRequest(http.MethodPost, "/api/chat/web/search", map[string]any{"query": "real companies"}))
		req.Header.Set("X-Actor-Source", "task_token")
		req.Header.Set("X-Task-ID", taskID)
		req.Header.Set("X-Agent-ID", agentID)
		rec := httptest.NewRecorder()
		testHandler.SearchCurrentTaskWeb(rec, req)
		return rec
	}
	if rec := call(); rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "web_search_not_configured") {
		t.Fatalf("authorized result = %d %s", rec.Code, rec.Body.String())
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE agent_task_queue SET originator_user_id='11111111-1111-1111-1111-111111111111',accountable_user_id='11111111-1111-1111-1111-111111111111' WHERE id=$1`, taskID); err != nil {
		t.Fatal(err)
	}
	if rec := call(); rec.Code != http.StatusForbidden {
		t.Fatalf("removed member result = %d %s", rec.Code, rec.Body.String())
	}
}

func TestWebRetrievalFailureStatusPreservesPreciseCode(t *testing.T) {
	for _, tc := range []struct {
		code   string
		status int
	}{
		{"invalid_web_url", 400}, {"web_provider_auth_failed", 503}, {"web_provider_rate_limited", 429}, {"web_page_login_required", 422}, {"web_page_captcha", 422},
	} {
		rec := httptest.NewRecorder()
		writeWebRetrievalError(rec, &service.WebRetrievalError{Code: tc.code, Message: "safe failure"})
		if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.code) {
			t.Fatalf("response = %d %s", rec.Code, rec.Body.String())
		}
	}
}
