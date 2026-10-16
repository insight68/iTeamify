package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iteamify-ai/iteamify/server/internal/migrations"
)

// readinessQuery counts only migrations whose SQL completed and whose
// checksum has been pinned by the migration runner. This keeps a server out of
// rotation when a prior migration attempt is dirty or when the bookkeeping
// table has not yet been upgraded from the legacy version-only shape.
// We compare the count to the full required set rather than checking a single
// "latest" row, so a missing out-of-order migration is not masked by a later
// version's presence.
const readinessQuery = `
	SELECT COUNT(*)
	FROM schema_migrations
	WHERE version = ANY($1)
	  AND status = 'succeeded'
	  AND checksum IS NOT NULL
`

const readinessCacheTTL = 3 * time.Second

type readinessDB interface {
	Ping(ctx context.Context) error
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type serverHealth struct {
	db                 readinessDB
	requiredMigrations []string
	initErr            error
	cacheTTL           time.Duration
	refreshMu          sync.Mutex
	cache              atomic.Pointer[cachedReadiness]
	identity           *serverIdentity
}

type serverIdentity struct {
	Project          string `json:"project"`
	InstanceID       string `json:"instance_id"`
	Version          string `json:"version"`
	Commit           string `json:"commit"`
	MigrationsDigest string `json:"migrations_digest"`
}

// Only local/test health responses expose build and schema identity.
func localServerIdentity(versions []string) *serverIdentity {
	if env := os.Getenv("APP_ENV"); env != "development" && env != "test" {
		return nil
	}
	buildCommit := commit
	if buildCommit == "unknown" {
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, setting := range info.Settings {
				if setting.Key == "vcs.revision" {
					buildCommit = setting.Value
				}
			}
		}
	}
	digest := sha256.Sum256([]byte(strings.Join(versions, "\n")))
	return &serverIdentity{Project: "aurocreator", InstanceID: os.Getenv("ITEAMIFY_PROJECT_ID"), Version: version, Commit: buildCommit, MigrationsDigest: hex.EncodeToString(digest[:])}
}

type cachedReadiness struct {
	response   readinessResponse
	statusCode int
	expiresAt  time.Time
}

type liveResponse struct {
	Status   string          `json:"status"`
	Identity *serverIdentity `json:"identity,omitempty"`
}

type readinessResponse struct {
	Status   string          `json:"status"`
	Checks   readinessChecks `json:"checks"`
	Identity *serverIdentity `json:"identity,omitempty"`
}

type readinessChecks struct {
	DB         string `json:"db"`
	Migrations string `json:"migrations"`
}

func newServerHealth(pool *pgxpool.Pool) *serverHealth {
	requiredMigrations, err := migrations.AllVersions()
	return &serverHealth{
		db:                 pool,
		requiredMigrations: requiredMigrations,
		initErr:            err,
		cacheTTL:           readinessCacheTTL,
		identity:           localServerIdentity(requiredMigrations),
	}
}

func (h *serverHealth) liveHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, liveResponse{Status: "ok", Identity: h.identity})
}

func (h *serverHealth) readyHandler(w http.ResponseWriter, r *http.Request) {
	resp, status := h.readiness(r.Context())
	writeJSON(w, status, resp)
}

func (h *serverHealth) readiness(parent context.Context) (readinessResponse, int) {
	if h.cacheTTL <= 0 {
		return h.computeReadiness(parent)
	}

	now := time.Now()
	if cached := h.loadCachedReadiness(now); cached != nil {
		return cached.response, cached.statusCode
	}

	h.refreshMu.Lock()
	defer h.refreshMu.Unlock()

	now = time.Now()
	if cached := h.loadCachedReadiness(now); cached != nil {
		return cached.response, cached.statusCode
	}

	resp, status := h.computeReadiness(parent)
	h.cache.Store(&cachedReadiness{
		response:   resp,
		statusCode: status,
		expiresAt:  now.Add(h.cacheTTL),
	})
	return resp, status
}

func (h *serverHealth) loadCachedReadiness(now time.Time) *cachedReadiness {
	cached := h.cache.Load()
	if cached == nil || !now.Before(cached.expiresAt) {
		return nil
	}
	return cached
}

func (h *serverHealth) computeReadiness(parent context.Context) (readinessResponse, int) {
	resp := readinessResponse{
		Status:   "ok",
		Identity: h.identity,
		Checks: readinessChecks{
			DB:         "ok",
			Migrations: "ok",
		},
	}

	if h.db == nil {
		resp.Status = "not_ready"
		resp.Checks.DB = "error"
		resp.Checks.Migrations = "unknown"
		return resp, http.StatusServiceUnavailable
	}

	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		resp.Status = "not_ready"
		resp.Checks.DB = "error"
		resp.Checks.Migrations = "unknown"
		return resp, http.StatusServiceUnavailable
	}

	if h.initErr != nil || len(h.requiredMigrations) == 0 {
		resp.Status = "not_ready"
		resp.Checks.Migrations = "error"
		return resp, http.StatusServiceUnavailable
	}

	var appliedCount int
	if err := h.db.QueryRow(ctx, readinessQuery, h.requiredMigrations).Scan(&appliedCount); err != nil {
		resp.Status = "not_ready"
		resp.Checks.Migrations = "error"
		return resp, http.StatusServiceUnavailable
	}

	// version is the schema_migrations PK, so each required version matches at
	// most one row; a count below the required total means at least one
	// migration this binary needs is missing, dirty, or lacks a checksum.
	if appliedCount < len(h.requiredMigrations) {
		resp.Status = "not_ready"
		resp.Checks.Migrations = "out_of_date"
		return resp, http.StatusServiceUnavailable
	}

	return resp, http.StatusOK
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	// Buffer the payload so we can emit an accurate Content-Length; encoding
	// straight into the ResponseWriter after WriteHeader would force chunked
	// transfer encoding and drop the header.
	body, err := json.Marshal(v)
	if err != nil {
		body = []byte(`{"error":"failed to encode response"}`)
		status = http.StatusInternalServerError
	}
	body = append(body, '\n')
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
