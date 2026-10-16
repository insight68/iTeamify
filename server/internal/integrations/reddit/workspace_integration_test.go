package reddit

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type redditFixture struct {
	s                *WorkspaceService
	ws, user, conn   string
	writes           atomic.Int32
	changed, unknown atomic.Bool
}

func fixture(t *testing.T) *redditFixture {
	t.Helper()
	dsn := os.Getenv("REDDIT_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("REDDIT_TEST_DATABASE_URL must name a disposable local database")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("reddit_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
	})
	if _, err = pool.Exec(ctx, `CREATE TABLE workspace(id uuid DEFAULT gen_random_uuid());CREATE TABLE member(workspace_id uuid,user_id uuid,role text);`); err != nil {
		t.Fatal(err)
	}
	// Install the current Reddit tables and indexes from the squashed baseline.
	baseline, err := os.ReadFile("../../../migrations/001_init.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	tables := regexp.MustCompile(`(?s)CREATE TABLE public\.reddit_[a-z_]+ \(.*?\n\);`).FindAllString(string(baseline), -1)
	if len(tables) != 4 {
		t.Fatalf("expected four Reddit tables in baseline, got %d", len(tables))
	}
	for _, sql := range tables {
		if _, err := pool.Exec(ctx, strings.ReplaceAll(sql, "public.", "")); err != nil {
			t.Fatal(err)
		}
	}
	paths, err := filepath.Glob("../../../migrations/*.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(body), "ON public.reddit_") {
			continue
		}
		if _, err := pool.Exec(ctx, strings.ReplaceAll(string(body), "public.", "")); err != nil {
			t.Fatalf("index %s: %v", path, err)
		}
	}
	box, _ := secretbox.New(make([]byte, 32))
	s, err := NewWorkspaceService(pool, box, WorkspaceConfig{ClientID: "test", ClientSecret: "secret", CallbackURL: "https://app.example/api/integrations/reddit/callback", UserAgent: "test:v1 (by /u/bot)"})
	if err != nil {
		t.Fatal(err)
	}
	f := &redditFixture{s: s}
	s.http = &http.Client{Transport: redditTransport(f.transport)}
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(pool.QueryRow(ctx, `INSERT INTO workspace DEFAULT VALUES RETURNING id::text`).Scan(&f.ws))
	must(pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&f.user))
	_, err = pool.Exec(ctx, `INSERT INTO member VALUES($1,$2,'owner')`, f.ws, f.user)
	must(err)
	b, _ := box.Seal([]byte("refresh"))
	must(pool.QueryRow(ctx, `INSERT INTO reddit_connection(workspace_id,user_id,reddit_user_id,username,refresh_token,scopes,can_reply) VALUES($1,$2,'account','bot',$3,'identity read submit',true) RETURNING id::text`, f.ws, f.user, b).Scan(&f.conn))
	return f
}
func (f *redditFixture) transport(r *http.Request) (*http.Response, error) {
	switch r.URL.Path {
	case tokenEndpoint:
		return redditHTTP(200, `{"access_token":"token","refresh_token":"refresh","scope":"identity read submit","expires_in":3600}`), nil
	case "/api/v1/me":
		return redditHTTP(200, `{"id":"account","name":"bot"}`), nil
	case "/r/saas/about":
		return redditHTTP(200, `{"data":{"subreddit_type":"public"}}`), nil
	case "/api/info":
		if r.URL.Query().Get("id") == "t1_receipt" {
			return redditHTTP(200, fmt.Sprintf(`{"data":{"children":[{"kind":"t1","data":{"name":"t1_receipt","parent_id":"t3_post","link_id":"t3_post","subreddit":"saas","body":"Helpful reply","author":"bot","created_utc":%d}}]}}`, time.Now().Unix())), nil
		}
		body := "Need help"
		if f.changed.Load() {
			body = "Edited"
		}
		return redditHTTP(200, fmt.Sprintf(`{"data":{"children":[{"kind":"t3","data":{"name":"t3_post","subreddit":"saas","title":"Question","selftext":%q,"author":"buyer","created_utc":100}}]}}`, body)), nil
	case apiComment:
		f.writes.Add(1)
		if f.unknown.Load() {
			return nil, errors.New("connection lost after Reddit accepted")
		}
		return redditHTTP(200, goodReceipt), nil
	default:
		return nil, fmt.Errorf("unexpected Reddit URL: %s", r.URL.Path)
	}
}
func (f *redditFixture) draft(t *testing.T) Draft {
	t.Helper()
	ctx := context.Background()
	c, _, e := f.s.client(ctx, f.ws, f.conn, false)
	if e != nil {
		t.Fatal(e)
	}
	target, e := publicTarget(ctx, c, "t3_post")
	if e != nil {
		t.Fatal(e)
	}
	d, e := f.s.SaveDraft(ctx, f.ws, f.user, "", "", DraftInput{ConnectionID: f.conn, Target: "t3_post", TargetVersion: target.Version, Body: "Helpful reply"})
	if e != nil {
		t.Fatal(e)
	}
	return d
}
func TestRedditIntegrationApprovalAndConcurrentDelivery(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	d := f.draft(t)
	if f.writes.Load() != 0 {
		t.Fatal("draft published")
	}
	other := "11111111-1111-4111-8111-111111111111"
	if _, e := f.s.Draft(ctx, other, d.ID); !errors.Is(e, pgx.ErrNoRows) {
		t.Fatal("cross-workspace draft leak")
	}
	if _, _, e := f.s.client(ctx, other, f.conn, false); !errors.Is(e, pgx.ErrNoRows) {
		t.Fatal("cross-workspace account leak")
	}
	if _, e := f.s.Queue(ctx, f.ws, f.user, d.ID, 2); !errors.Is(e, ErrConflict) {
		t.Fatal("stale version approved")
	}
	var wg sync.WaitGroup
	var approved atomic.Int32
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := f.s.Queue(ctx, f.ws, f.user, d.ID, 1)
			if err == nil {
				approved.Add(1)
			} else if !errors.Is(err, ErrConflict) {
				t.Errorf("queue: %v", err)
			}
		}()
	}
	wg.Wait()
	if approved.Load() != 1 {
		t.Fatalf("approval count %d", approved.Load())
	}
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := f.s.ProcessOne(ctx); err != nil {
				t.Errorf("send: %v", err)
			}
		}()
	}
	wg.Wait()
	got, e := f.s.Draft(ctx, f.ws, d.ID)
	if e != nil {
		t.Fatal(e)
	}
	if got.Status != "sent" || got.SentFullname != "t1_receipt" || f.writes.Load() != 1 {
		t.Fatalf("delivery %#v writes=%d", got, f.writes.Load())
	}
}
func TestRedditIntegrationUnknownNeverRetries(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	d := f.draft(t)
	if _, e := f.s.Queue(ctx, f.ws, f.user, d.ID, 1); e != nil {
		t.Fatal(e)
	}
	f.unknown.Store(true)
	if _, e := f.s.ProcessOne(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e := f.s.ProcessOne(ctx); e != nil {
		t.Fatal(e)
	}
	got, _ := f.s.Draft(ctx, f.ws, d.ID)
	if got.Status != "unknown" || f.writes.Load() != 1 {
		t.Fatalf("unknown retried: %s %d", got.Status, f.writes.Load())
	}
	if _, e := f.s.Queue(ctx, f.ws, f.user, d.ID, 1); !errors.Is(e, ErrConflict) {
		t.Fatal("unknown queued")
	}
	verified, e := f.s.Verify(ctx, f.ws, d.ID, "t1_receipt", 1)
	if e != nil || verified.Status != "sent" {
		t.Fatalf("verify: %v %#v", e, verified)
	}
	if f.writes.Load() != 1 {
		t.Fatal("verification sent")
	}
}
func TestRedditIntegrationChangedTargetAndRemovedApprover(t *testing.T) {
	for _, change := range []string{"target", "approver"} {
		t.Run(change, func(t *testing.T) {
			f := fixture(t)
			ctx := context.Background()
			d := f.draft(t)
			if _, e := f.s.Queue(ctx, f.ws, f.user, d.ID, 1); e != nil {
				t.Fatal(e)
			}
			if change == "target" {
				f.changed.Store(true)
			} else {
				_, _ = f.s.pool.Exec(ctx, `UPDATE member SET role='member' WHERE user_id=$1`, f.user)
			}
			if _, e := f.s.ProcessOne(ctx); e != nil {
				t.Fatal(e)
			}
			got, _ := f.s.Draft(ctx, f.ws, d.ID)
			if got.Status != "failed" || f.writes.Load() != 0 {
				t.Fatalf("invalid approval sent: %#v", got)
			}
		})
	}
}
func TestRedditIntegrationDisconnectAndRetention(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	d := f.draft(t)
	_, _ = f.s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET expires_at=now()-interval '1 minute' WHERE id=$1`, d.ID)
	if e := f.s.Maintenance(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e := f.s.Draft(ctx, f.ws, d.ID); !errors.Is(e, pgx.ErrNoRows) {
		t.Fatal("expired draft retained")
	}
	d = f.draft(t)
	if _, e := f.s.Queue(ctx, f.ws, f.user, d.ID, 1); e != nil {
		t.Fatal(e)
	}
	if e := f.s.Disconnect(ctx, f.ws, f.conn); e != nil {
		t.Fatal(e)
	}
	if _, e := f.s.ProcessOne(ctx); e != nil {
		t.Fatal(e)
	}
	if f.writes.Load() != 0 {
		t.Fatal("disconnected account sent")
	}
	var token []byte
	if e := f.s.pool.QueryRow(ctx, `SELECT refresh_token FROM reddit_connection WHERE id=$1`, f.conn).Scan(&token); e != nil || len(token) != 0 {
		t.Fatal("credential retained")
	}
}
func TestRedditIntegrationOAuthStateAndAccountBinding(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	u, e := f.s.Begin(ctx, f.ws, f.user, f.conn, true)
	if e != nil {
		t.Fatal(e)
	}
	parsed, _ := url.Parse(u)
	state := parsed.Query().Get("state")
	if parsed.Query().Get("duration") != "permanent" || !strings.Contains(parsed.Query().Get("scope"), "submit") {
		t.Fatal("incorrect OAuth request")
	}
	if e = f.s.Complete(ctx, state, "code"); e != nil {
		t.Fatal(e)
	}
	if e = f.s.Complete(ctx, state, "code"); !errors.Is(e, ErrPermission) {
		t.Fatal("OAuth replay succeeded")
	}
	u, e = f.s.Begin(ctx, f.ws, f.user, f.conn, true)
	if e != nil {
		t.Fatal(e)
	}
	parsed, _ = url.Parse(u)
	_, _ = f.s.pool.Exec(ctx, `UPDATE member SET role='member' WHERE user_id=$1`, f.user)
	if e = f.s.Complete(ctx, parsed.Query().Get("state"), "code"); !errors.Is(e, ErrPermission) {
		t.Fatal("removed admin installed")
	}
}
func TestRedditIntegrationBudgetAtomic(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	var ok atomic.Int32
	for i := 0; i < 110; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := f.s.takeBudget(ctx)
			if err == nil {
				ok.Add(1)
			} else if !errors.Is(err, ErrRateLimited) {
				t.Errorf("budget: %v", err)
			}
		}()
	}
	wg.Wait()
	if ok.Load() != 85 {
		t.Fatalf("reserved %d, expected 85", ok.Load())
	}
}

func TestRedditIntegrationSourceDeletionAndStaleSend(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	d := f.draft(t)
	if _, err := f.s.Queue(ctx, f.ws, f.user, d.ID, 1); err != nil {
		t.Fatal(err)
	}
	_, err := f.s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET status='sending',lease_until=now()-interval '1 minute' WHERE id=$1`, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.s.Maintenance(ctx); err != nil {
		t.Fatal(err)
	}
	got, err := f.s.Draft(ctx, f.ws, d.ID)
	if err != nil || got.Status != "unknown" {
		t.Fatalf("stale send: %#v %v", got, err)
	}
	if _, err = f.s.ProcessOne(ctx); err != nil {
		t.Fatal(err)
	}
	if f.writes.Load() != 0 {
		t.Fatal("stale send replayed")
	}
	_, err = f.s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET source_checked_at=now()-interval '7 hours' WHERE id=$1`, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	f.s.http.Transport = redditTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/api/info" {
			return redditHTTP(200, `{"data":{"children":[{"kind":"t3","data":{"name":"t3_post","subreddit":"saas","selftext":"[deleted]"}}]}}`), nil
		}
		return f.transport(r)
	})
	if err = f.s.CheckDraftTargets(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = f.s.Draft(ctx, f.ws, d.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("deleted source draft retained")
	}
}

func TestRedditIntegrationRefreshRotationAndProviderBudget(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	f.s.http.Transport = redditTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == tokenEndpoint {
			return redditHTTP(200, `{"access_token":"new","refresh_token":"rotated","expires_in":3600}`), nil
		}
		return f.transport(r)
	})
	c, _, err := f.s.client(ctx, f.ws, f.conn, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.token(ctx); err != nil {
		t.Fatal(err)
	}
	var b []byte
	if err = f.s.pool.QueryRow(ctx, `SELECT refresh_token FROM reddit_connection WHERE id=$1`, f.conn).Scan(&b); err != nil {
		t.Fatal(err)
	}
	plain, err := f.s.box.Open(b)
	if err != nil || string(plain) != "rotated" {
		t.Fatal("rotated token not persisted")
	}
	r := redditHTTP(200, "{}")
	r.Header.Set("X-Ratelimit-Remaining", "999")
	r.Header.Set("X-Ratelimit-Reset", "600")
	if err = f.s.observeBudget(ctx, r); err != nil {
		t.Fatal(err)
	}
	var seconds float64
	if err = f.s.pool.QueryRow(ctx, `SELECT EXTRACT(EPOCH FROM reset_at-now())::double precision FROM reddit_request_budget WHERE client_id='test'`).Scan(&seconds); err != nil {
		t.Fatal(err)
	}
	if seconds > 65 {
		t.Fatal("normal provider window incorrectly froze the local minute budget")
	}
}

func TestRedditIntegrationBoundedReadAndCommentContext(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	f.s.http.Transport = redditTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/r/saas/search":
			if r.URL.Query().Get("restrict_sr") != "1" || r.URL.Query().Get("after") != "t3_cursor" || r.URL.Query().Get("limit") != "2" {
				t.Fatal("search pagination was not forwarded")
			}
			return redditHTTP(200, `{"data":{"after":"t3_next","children":[{"kind":"t3","data":{"name":"t3_post","subreddit":"saas","title":"Question","selftext":"Need help","author":"buyer"}},{"kind":"t3","data":{"name":"t3_nsfw","subreddit":"saas","over_18":true}}]}}`), nil
		case "/api/info":
			if r.URL.Query().Get("id") == "t1_target" {
				return redditHTTP(200, `{"data":{"children":[{"kind":"t1","data":{"name":"t1_target","parent_id":"t3_post","link_id":"t3_post","subreddit":"saas","body":"Target","author":"buyer"}}]}}`), nil
			}
		case "/comments/post":
			if r.URL.Query().Get("comment") != "target" || r.URL.Query().Get("context") != "8" {
				t.Fatal("comment context missing")
			}
			return redditHTTP(200, `[{"data":{"children":[{"kind":"t3","data":{"name":"t3_post","subreddit":"saas","selftext":"Need help"}}]}},{"data":{"children":[{"kind":"more","data":{}}]}}]`), nil
		}
		return f.transport(r)
	})
	page, err := f.s.Search(ctx, f.ws, f.conn, "SaaS", "help", "t3_cursor", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.NextCursor != "t3_next" || !page.Partial {
		t.Fatalf("search %#v", page)
	}
	page, err = f.s.Thread(ctx, f.ws, f.conn, "t1_target", 5)
	if err != nil {
		t.Fatal(err)
	}
	if !page.Partial || len(page.Items) != 2 || page.Items[1].Fullname != "t1_target" {
		t.Fatalf("target omitted %#v", page)
	}
	if _, err = f.s.Search(ctx, f.ws, f.conn, "../private", "", "", 5); !errors.Is(err, ErrInvalid) {
		t.Fatal("invalid subreddit accepted")
	}
}
