package scheduler

import (
	"context"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/integrations/reddit"
)

func RedditReplyJob(s *reddit.WorkspaceService) JobSpec {
	return JobSpec{Name: "reddit_reply_delivery", Cadence: 30 * time.Second, CatchUpMode: CatchUpLatestOnly, RunTimeout: time.Minute, StaleTimeout: 3 * time.Minute, HeartbeatInterval: 15 * time.Second, MaxAttempts: 1, Scopes: StaticScopes(ScopeGlobal),
		Handler: func(ctx context.Context, _ HandlerInput) (HandlerResult, error) {
			if err := s.Maintenance(ctx); err != nil {
				return HandlerResult{}, err
			}
			// One bounded delivery per tick. A stale send is reconciled to unknown, never replayed.
			worked, err := s.ProcessOne(ctx)
			var n int64
			if worked {
				n = 1
			}
			return HandlerResult{RowsAffected: n}, err
		}}
}

func RedditRetentionJob(s *reddit.WorkspaceService) JobSpec {
	return JobSpec{Name: "reddit_content_cleanup", Cadence: 5 * time.Minute, CatchUpMode: CatchUpLatestOnly, RunTimeout: 2 * time.Minute, StaleTimeout: 4 * time.Minute, HeartbeatInterval: 30 * time.Second, MaxAttempts: 1, Scopes: StaticScopes(ScopeGlobal), Handler: func(ctx context.Context, _ HandlerInput) (HandlerResult, error) {
		return HandlerResult{}, s.CheckDraftTargets(ctx)
	}}
}
