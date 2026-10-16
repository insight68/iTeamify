package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInferAssistantResourceMetadata(t *testing.T) {
	record := struct {
		DisplayName string `json:"display_name"`
		Version     int32  `json:"version"`
	}{DisplayName: "Acme", Version: 4}

	version := inferAssistantResourceVersion(record)
	if version == nil || *version != 4 {
		t.Fatalf("version = %v", version)
	}
	if label := inferAssistantResourceLabel(record, "lead", "lead-1"); label != "Acme" {
		t.Fatalf("label = %q", label)
	}
}

func TestInferAssistantResourceLabelFallsBackToIdentity(t *testing.T) {
	if label := inferAssistantResourceLabel(struct{}{}, "company_profile", "current"); label != "company_profile:current" {
		t.Fatalf("label = %q", label)
	}
}

func TestCreateChatSessionAttachesValidatedContextResources(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	agentID := createHandlerTestAgent(t, "ChatContextResourceAgent", []byte("[]"))
	w := httptest.NewRecorder()
	request := withChatTestWorkspaceCtx(t, newRequest(http.MethodPost, "/api/chat/sessions", map[string]any{
		"agent_id": agentID,
		"title":    "Company context",
		"context_resources": []map[string]any{{
			"resource_type": "company_profile",
			"resource_id":   "current",
			"source":        "page",
		}},
	}))
	testHandler.CreateChatSession(w, request)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateChatSession: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var session ChatSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM chat_context_resource WHERE chat_session_id = $1`, session.ID)
		_, _ = testPool.Exec(context.Background(), `DELETE FROM chat_session WHERE id = $1`, session.ID)
	})

	var resourceType, resourceID, source string
	if err := testPool.QueryRow(context.Background(), `
		SELECT resource_type, resource_id, source
		FROM chat_context_resource
		WHERE chat_session_id = $1
	`, session.ID).Scan(&resourceType, &resourceID, &source); err != nil {
		t.Fatalf("load context resource: %v", err)
	}
	if resourceType != "company_profile" || resourceID != "current" || source != "page" {
		t.Fatalf("stored context = %s/%s source=%s", resourceType, resourceID, source)
	}
}
