package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/redis/go-redis/v9"
)

func TestWorkspaceWebRateLimitSharesToolsButSeparatesWorkspaces(t *testing.T) {
	for _, mode := range []string{"local", "redis"} {
		t.Run(mode, func(t *testing.T) {
			var rdb *redis.Client
			if mode == "redis" {
				rdb = newRedisTestClient(t)
			}
			handler := RateLimitWorkspace(rdb, "web-retrieval", 1, time.Minute)(okHandler)
			for _, tc := range []struct {
				workspace, path string
				want            int
			}{
				{"workspace-a", "/search", http.StatusOK},
				{"workspace-a", "/fetch", http.StatusTooManyRequests},
				{"workspace-b", "/fetch", http.StatusOK},
				{"", "/search", http.StatusForbidden},
			} {
				req := httptest.NewRequest(http.MethodPost, tc.path, nil)
				req = req.WithContext(SetMemberContext(req.Context(), tc.workspace, db.Member{}))
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, req)
				if rec.Code != tc.want {
					t.Fatalf("workspace=%s path=%s status=%d want=%d", tc.workspace, tc.path, rec.Code, tc.want)
				}
			}
		})
	}
}
