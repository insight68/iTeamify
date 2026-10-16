package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
)

func TestOutboundEmailHumanBoundary(t *testing.T) {
	for _, source := range []string{"task_token", "cloud_pat"} {
		t.Run(source, func(t *testing.T) {
			h := &Handler{}
			router := chi.NewRouter()
			router.With(RequireHumanActor).Post("/api/outbound-emails/{id}/send", h.SendOutboundEmail)
			request := newRequest(http.MethodPost, "/api/outbound-emails/11111111-1111-4111-8111-111111111111/send", map[string]any{"expected_version": 1, "confirmed": true})
			request.Header.Set("X-Actor-Source", source)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusForbidden {
				t.Fatalf("machine send status=%d", recorder.Code)
			}
		})
	}
}

func TestOutboundEmailResourceCannotSend(t *testing.T) {
	registry := newAssistantResourceRegistry(&Handler{})
	_, err := registry.Execute(context.Background(), assistantresource.Principal{Role: "owner"}, assistantresource.ActionRequest{Resource: "outbound_email", Action: "send", Confirmed: true})
	if !errors.Is(err, assistantresource.ErrActionNotFound) {
		t.Fatalf("agent send action accepted: %v", err)
	}
}
