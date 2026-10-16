package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"sync"
	"testing"
	"time"
)

// This baseline exercises the real router and PostgreSQL, without a model or external agent.
func BenchmarkIssueReadWork(b *testing.B) {
	if os.Getenv("ITEAMIFY_RUN_PERFORMANCE_BASELINE") != "1" {
		b.Skip("run make performance-baseline against the isolated local database")
	}
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Cleanup(func() { slog.SetDefault(previousLogger) })
	ctx := context.Background()
	var startNumber int
	if err := testPool.QueryRow(ctx, `SELECT COALESCE(MAX(number), 0) FROM issue WHERE workspace_id=$1`, testWorkspaceID).Scan(&startNumber); err != nil {
		b.Fatal(err)
	}
	statuses := []string{"backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"}
	var issueID string
	rows, err := testPool.Query(ctx, `
 INSERT INTO issue (workspace_id, title, description, status, creator_type, creator_id, number, position)
 SELECT $1, 'Baseline issue ' || g, repeat('Representative body. ', 20),
 (ARRAY['backlog','todo','in_progress','in_review','done','blocked','cancelled'])[1+(g%7)],
 'member', $2, $3+g, g FROM generate_series(1, 1000) AS g RETURNING id`, testWorkspaceID, testUserID, startNumber)
	if err != nil {
		b.Fatal(err)
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			b.Fatal(err)
		}
		if issueID == "" {
			issueID = id
		}
	}
	if err := rows.Err(); err != nil {
		b.Fatal(err)
	}
	rows.Close()
	b.Cleanup(func() {
		if _, err := testPool.Exec(ctx, `DELETE FROM issue WHERE workspace_id=$1 AND number>$2`, testWorkspaceID, startNumber); err != nil {
			b.Error(err)
		}
	})
	cases := []struct {
		name  string
		paths []string
	}{
		{"detail", []string{"/api/issues/" + issueID}},
		{"legacy_detail_and_seven_status_heads", []string{"/api/issues/" + issueID}},
	}
	for _, status := range statuses {
		cases[1].paths = append(cases[1].paths, "/api/issues?status="+status+"&limit=50")
	}
	for _, tc := range cases {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			durations := make([]float64, 0, min(b.N, 10000))
			var totalBytes int64
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				started := time.Now()
				results := make(chan int, len(tc.paths))
				var wg sync.WaitGroup
				for _, path := range tc.paths {
					wg.Add(1)
					go func(path string) {
						defer wg.Done()
						req := httptest.NewRequest(http.MethodGet, path, nil)
						req.Header.Set("Authorization", "Bearer "+testToken)
						req.Header.Set("X-Workspace-ID", testWorkspaceID)
						rec := httptest.NewRecorder()
						testServer.Config.Handler.ServeHTTP(rec, req)
						if rec.Code != http.StatusOK {
							b.Error(fmt.Sprintf("%s: %d %s", path, rec.Code, rec.Body.String()))
							return
						}
						results <- rec.Body.Len()
					}(path)
				}
				wg.Wait()
				close(results)
				for size := range results {
					totalBytes += int64(size)
				}
				if len(durations) < cap(durations) {
					durations = append(durations, float64(time.Since(started).Microseconds())/1000)
				}
			}
			b.StopTimer()
			sort.Float64s(durations)
			if len(durations) > 0 {
				b.ReportMetric(durations[int(float64(len(durations)-1)*0.95)], "p95_ms/action")
			}
			b.ReportMetric(float64(totalBytes)/float64(b.N), "bytes/action")
			b.ReportMetric(float64(len(tc.paths)), "requests/action")
		})
	}
}
