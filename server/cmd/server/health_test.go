package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type stubReadinessDB struct {
	pingErr      error
	queryErr     error
	appliedCount int
	lastQuery    string
	pingCalls    atomic.Int32
	queryCalls   atomic.Int32
}

func TestLocalServerIdentity(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("ITEAMIFY_PROJECT_ID", "aurocreator:test")
	identity := localServerIdentity([]string{"001_init", "002_next"})
	if identity == nil || identity.Project != "aurocreator" || identity.InstanceID != "aurocreator:test" || len(identity.MigrationsDigest) != 64 {
		t.Fatalf("unexpected local identity: %+v", identity)
	}
	if identity.MigrationsDigest == localServerIdentity([]string{"001_init"}).MigrationsDigest {
		t.Fatal("migration set changes must change the identity")
	}
	t.Setenv("APP_ENV", "production")
	if localServerIdentity([]string{"001_init"}) != nil {
		t.Fatal("production must not expose local identity")
	}
}

func (s *stubReadinessDB) Ping(context.Context) error {
	s.pingCalls.Add(1)
	return s.pingErr
}

func (s *stubReadinessDB) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	s.queryCalls.Add(1)
	s.lastQuery = query
	return stubRow{appliedCount: s.appliedCount, err: s.queryErr}
}

type stubRow struct {
	appliedCount int
	err          error
}

func (r stubRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*(dest[0].(*int)) = r.appliedCount
	return nil
}

func TestServerHealthReadyHandlerDBPingFailure(t *testing.T) {
	db := &stubReadinessDB{pingErr: errors.New("db unavailable")}
	h := &serverHealth{
		db:                 db,
		requiredMigrations: []string{"056_example"},
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	h.readyHandler(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}

	var resp readinessResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Status != "not_ready" {
		t.Fatalf("status = %q, want %q", resp.Status, "not_ready")
	}
	if resp.Checks.DB != "error" {
		t.Fatalf("db check = %q, want %q", resp.Checks.DB, "error")
	}
	if resp.Checks.Migrations != "unknown" {
		t.Fatalf("migrations check = %q, want %q", resp.Checks.Migrations, "unknown")
	}
}

func TestServerHealthReadyHandlerMigrationOutOfDate(t *testing.T) {
	db := &stubReadinessDB{appliedCount: 0}
	h := &serverHealth{
		db:                 db,
		requiredMigrations: []string{"056_example"},
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	h.readyHandler(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}

	var resp readinessResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Status != "not_ready" {
		t.Fatalf("status = %q, want %q", resp.Status, "not_ready")
	}
	if resp.Checks.DB != "ok" {
		t.Fatalf("db check = %q, want %q", resp.Checks.DB, "ok")
	}
	if resp.Checks.Migrations != "out_of_date" {
		t.Fatalf("migrations check = %q, want %q", resp.Checks.Migrations, "out_of_date")
	}
}

func TestServerHealthReadyHandlerMigrationPartiallyApplied(t *testing.T) {
	// Three migrations required but only two recorded — the out-of-order case
	// the old "is the latest version applied?" check used to mask. Readiness
	// must report not_ready, not ok.
	db := &stubReadinessDB{appliedCount: 2}
	h := &serverHealth{
		db:                 db,
		requiredMigrations: []string{"120_a", "120_b", "121_c"},
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	h.readyHandler(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}

	var resp readinessResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Status != "not_ready" {
		t.Fatalf("status = %q, want %q", resp.Status, "not_ready")
	}
	if resp.Checks.Migrations != "out_of_date" {
		t.Fatalf("migrations check = %q, want %q", resp.Checks.Migrations, "out_of_date")
	}
}

func TestServerHealthReadinessCachesResult(t *testing.T) {
	db := &stubReadinessDB{appliedCount: 1}
	h := &serverHealth{
		db:                 db,
		requiredMigrations: []string{"056_example"},
		cacheTTL:           time.Minute,
	}

	resp1, status1 := h.readiness(context.Background())
	resp2, status2 := h.readiness(context.Background())

	if status1 != http.StatusOK || status2 != http.StatusOK {
		t.Fatalf("expected cached readiness status 200, got %d and %d", status1, status2)
	}
	if resp1.Status != "ok" || resp2.Status != "ok" {
		t.Fatalf("expected cached readiness status ok, got %q and %q", resp1.Status, resp2.Status)
	}
	if got := db.pingCalls.Load(); got != 1 {
		t.Fatalf("Ping calls = %d, want 1", got)
	}
	if got := db.queryCalls.Load(); got != 1 {
		t.Fatalf("QueryRow calls = %d, want 1", got)
	}
}

func TestServerHealthReadinessRequiresMigrationIntegrity(t *testing.T) {
	db := &stubReadinessDB{appliedCount: 1}
	h := &serverHealth{
		db:                 db,
		requiredMigrations: []string{"056_example"},
		cacheTTL:           -1,
	}

	resp, status := h.readiness(context.Background())
	if status != http.StatusOK || resp.Status != "ok" {
		t.Fatalf("readiness = %d/%q, want 200/ok", status, resp.Status)
	}
	for _, required := range []string{"status = 'succeeded'", "checksum IS NOT NULL"} {
		if !strings.Contains(db.lastQuery, required) {
			t.Errorf("readiness query %q does not require %q", db.lastQuery, required)
		}
	}
}
