package handler

import (
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRedditHumanApprovalBoundary(t *testing.T) {
	for _, source := range []string{"task_token", "cloud_pat"} {
		for _, action := range []string{"approve", "verify", "cancel"} {
			h := &Handler{}
			router := chi.NewRouter()
			router.With(RequireHumanActor).Post("/api/reddit/drafts/{id}/{action}", h.RedditDraftAction)
			r := newRequest(http.MethodPost, "/api/reddit/drafts/11111111-1111-4111-8111-111111111111/"+action, map[string]any{"expected_version": 1})
			r.Header.Set("X-Actor-Source", source)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, r)
			if w.Code != 403 {
				t.Fatalf("%s %s status=%d", source, action, w.Code)
			}
		}
	}
}
