package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/iteamify-ai/iteamify/server/internal/middleware"
	"github.com/iteamify-ai/iteamify/server/internal/openagentendpoint"
	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type workspaceOpenAgentTestFn func(context.Context, OpenAgentEndpoint) error

func (fn workspaceOpenAgentTestFn) Test(ctx context.Context, e OpenAgentEndpoint) error {
	return fn(ctx, e)
}

func TestWorkspaceOpenAgentOwnerUpdatesAreEncryptedIsolatedAndRevisionGuarded(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	h := *testHandler
	box, err := secretbox.New(bytes.Repeat([]byte{5}, 32))
	if err != nil {
		t.Fatal(err)
	}
	h.OpenAgentSecretBox = box
	var otherID string
	if err = testPool.QueryRow(ctx, `INSERT INTO workspace(name,slug,issue_prefix) VALUES ('Other','openagent-'||substr(gen_random_uuid()::text,1,8),'OAG') RETURNING id`).Scan(&otherID); err != nil {
		t.Fatal(err)
	}
	if _, err = testPool.Exec(ctx, `INSERT INTO member(workspace_id,user_id,role) VALUES ($1,$2,'owner')`, otherID, testUserID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(ctx, `DELETE FROM workspace_openagent_config WHERE workspace_id IN ($1,$2)`, testWorkspaceID, otherID)
		_, _ = testPool.Exec(ctx, `DELETE FROM member WHERE workspace_id=$1`, otherID)
		_, _ = testPool.Exec(ctx, `DELETE FROM workspace WHERE id=$1`, otherID)
	})
	put := func(id, key, model string, revision int64) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := withURLParam(newRequest(http.MethodPut, "/api/workspaces/"+id+"/openagent/config", map[string]any{"expected_revision": revision, "base_url": "https://provider.example.com/anthropic", "model": model, "api_key": key}), "id", id)
		h.UpdateWorkspaceOpenAgentConfig(w, req)
		return w
	}
	for _, tc := range []struct{ id, key, model string }{{testWorkspaceID, "workspace-a-secret", "model-a"}, {otherID, "workspace-b-secret", "model-b"}} {
		w := put(tc.id, tc.key, tc.model, 0)
		if w.Code != 200 || strings.Contains(w.Body.String(), tc.key) {
			t.Fatalf("owner save=%d %s", w.Code, w.Body.String())
		}
		row, err := h.Queries.GetWorkspaceOpenAgentConfig(ctx, parseUUID(tc.id))
		if err != nil || bytes.Contains(row.ApiKeyEncrypted, []byte(tc.key)) {
			t.Fatal("plaintext credential stored")
		}
	}
	w := put(testWorkspaceID, "", "model-a-new", 1)
	if w.Code != 200 {
		t.Fatalf("revision update=%d %s", w.Code, w.Body.String())
	}
	stale := put(testWorkspaceID, "", "stale-model", 1)
	if stale.Code != 409 {
		t.Fatalf("stale update=%d %s", stale.Code, stale.Body.String())
	}
	row, err := h.Queries.GetWorkspaceOpenAgentConfig(ctx, parseUUID(testWorkspaceID))
	if err != nil || row.Model != "model-a-new" || row.Revision != 2 {
		t.Fatal("revision guard failed")
	}
	plain, err := box.Open(row.ApiKeyEncrypted)
	if err != nil || string(plain) != "workspace-a-secret" {
		t.Fatal("blank key did not preserve credential")
	}
	get := httptest.NewRecorder()
	h.GetWorkspaceOpenAgentConfig(get, withURLParam(newRequest(http.MethodGet, "/api/workspaces/"+testWorkspaceID+"/openagent/config", nil), "id", testWorkspaceID))
	if get.Code != 200 || strings.Contains(get.Body.String(), "workspace-a-secret") {
		t.Fatal("browser response leaked credential")
	}
	for _, id := range []string{testWorkspaceID, otherID} {
		req := withURLParam(newRequest(http.MethodGet, "/api/daemon/workspaces/"+id+"/openagent/config", nil), "id", id)
		req = req.WithContext(middleware.WithManagedDaemonContext(req.Context(), "shared-daemon"))
		response := httptest.NewRecorder()
		h.GetDaemonWorkspaceOpenAgentConfig(response, req)
		var config map[string]any
		if err = json.Unmarshal(response.Body.Bytes(), &config); err != nil || response.Code != 200 {
			t.Fatalf("daemon config=%d %s", response.Code, response.Body.String())
		}
		if id == otherID && config["api_key"] != "workspace-b-secret" {
			t.Fatal("workspace credentials crossed")
		}
	}
	denied := httptest.NewRecorder()
	h.GetDaemonWorkspaceOpenAgentConfig(denied, withURLParam(newRequest(http.MethodGet, "/api/daemon/workspaces/"+testWorkspaceID+"/openagent/config", nil), "id", testWorkspaceID))
	if denied.Code != 403 {
		t.Fatal("human actor obtained daemon credential")
	}
	calls := 0
	h.OpenAgentEndpointTester = workspaceOpenAgentTestFn(func(_ context.Context, e OpenAgentEndpoint) error {
		calls++
		if e.APIKey != "workspace-b-secret" || e.Model != "model-b" {
			t.Fatal("test crossed workspace credential boundary")
		}
		return nil
	})
	tested := httptest.NewRecorder()
	h.TestWorkspaceOpenAgentConfig(tested, withURLParam(newRequest(http.MethodPost, "/api/workspaces/"+otherID+"/openagent/test", map[string]any{"expected_revision": 1, "base_url": "https://provider.example.com/anthropic", "model": "model-b"}), "id", otherID))
	if tested.Code != 200 || calls != 1 {
		t.Fatalf("owner test=%d %s", tested.Code, tested.Body.String())
	}
	h.OpenAgentEndpointTester = workspaceOpenAgentTestFn(func(context.Context, OpenAgentEndpoint) error {
		return fmt.Errorf("credential-echo-secret: %w", openagentendpoint.ErrNonPublicAddress)
	})
	failedTest := httptest.NewRecorder()
	h.TestWorkspaceOpenAgentConfig(failedTest, withURLParam(newRequest(http.MethodPost, "/api/workspaces/"+otherID+"/openagent/test", map[string]any{"expected_revision": 1, "base_url": "https://provider.example.com/anthropic", "model": "model-b"}), "id", otherID))
	var failedResult openAgentProbeResult
	if err = json.Unmarshal(failedTest.Body.Bytes(), &failedResult); err != nil || failedTest.Code != http.StatusOK || failedResult.OK || failedResult.Code != "network_policy" || strings.Contains(failedTest.Body.String(), "credential-echo-secret") || failedTest.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("failed probe=%d %s", failedTest.Code, failedTest.Body.String())
	}
	// An admin remains a member but may neither update nor test the model.
	if _, err = testPool.Exec(ctx, `UPDATE member SET role='admin' WHERE workspace_id=$1 AND user_id=$2`, otherID, testUserID); err != nil {
		t.Fatal(err)
	}
	denied = put(otherID, "bad-key", "bad-model", 1)
	if denied.Code != 403 {
		t.Fatal("admin modified owner configuration")
	}
	denied = httptest.NewRecorder()
	h.TestWorkspaceOpenAgentConfig(denied, withURLParam(newRequest(http.MethodPost, "/api/workspaces/"+otherID+"/openagent/test", map[string]any{}), "id", otherID))
	if denied.Code != 403 {
		t.Fatal("admin tested owner credential")
	}
}
