package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimitWorkspace must follow authenticated workspace membership. All
// operations in the class share a workspace bucket, including tasks served
// by a common daemon IP. Redis outages retain the local safety ceiling.
func RateLimitWorkspace(rdb *redis.Client, class string, limit int, window time.Duration) func(http.Handler) http.Handler {
	local := &localFixedWindow{}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			workspaceID := WorkspaceIDFromContext(r.Context())
			if workspaceID == "" {
				http.Error(w, "workspace context is required", http.StatusForbidden)
				return
			}
			key := rateLimitKey("workspace/"+class, workspaceID)
			var count int64
			var err error
			if rdb != nil {
				count, err = rateLimitScript.Run(r.Context(), rdb, []string{key}, int(window.Seconds())).Int64()
			}
			if rdb == nil || err != nil {
				count = local.increment(key, window, time.Now())
			}
			if count > int64(limit) {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(window.Seconds())))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{"code": "web_workspace_rate_limited", "error": "workspace web retrieval rate limit reached; retry later"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
