package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/attributionbackfill"
	"github.com/iteamify-ai/iteamify/server/internal/logger"
	"github.com/iteamify-ai/iteamify/server/internal/migrations"

	"github.com/iteamify-ai/iteamify/server/internal/taskusagebackfill"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// preMigrationHook runs work that must happen before a specific
// migration is applied during `migrate up`. Hooks are idempotent and
// must not depend on the migration loop's session-pinned advisory lock
// — they run on the pool, not on the loop's pinned conn, so they can
// safely acquire other session-level locks (e.g. advisory lock 4246
// for the task_usage hourly rollup).
//
// Returning an error aborts the migration run. The corresponding
// migration is NOT recorded in schema_migrations, so the next run will
// retry the hook + migration.
type preMigrationHook func(ctx context.Context, pool *pgxpool.Pool) error

// preMigrationHooks wires migration version → hook. The version key is
// the file basename without the `.up.sql` suffix, matching what
// `migrations.ExtractVersion` returns.
//
// MUL-2957: the v0.3.4 → current direct-upgrade path needs the hourly
// rollup seeded BEFORE migration 103 evaluates its fail-closed lag
// guard, because at `cmd/migrate up` time the server has not yet
// started so neither the legacy pg_cron job nor the new app scheduler
// can advance the watermark. The hook runs the same idempotent
// monthly-slice backfill that
// `cmd/backfill_task_usage_hourly` exposes to operators.
//
// MUL-4897 / GH #5544: migration 198 VALIDATEs the strict attribution
// constraint installed by 197, which drops migration 190's
// originator_source IS NULL exemption. Self-hosted databases never ran the
// out-of-band backfill that iTeamify's cloud did, so their legacy rows make
// 198 fail closed and the backend refuses to start. The hook reconciles
// those rows (accountable_user_id := originator_user_id) idempotently BEFORE
// VALIDATE, so a stuck-at-197 instance auto-heals on `migrate up` with no
// manual SQL. A higher-numbered migration cannot help — the instance never
// reaches a version above the failing 198.
var preMigrationHooks = map[string]preMigrationHook{
	"103_drop_legacy_daily_rollups":                         runTaskUsageHourlyHook,
	"198_agent_task_attribution_strict_constraint_validate": runAttributionStrictHook,
}

func runTaskUsageHourlyHook(ctx context.Context, pool *pgxpool.Pool) error {
	res, err := taskusagebackfill.Hook(ctx, pool, taskusagebackfill.HookOptions{})
	if err != nil {
		return fmt.Errorf("task_usage_hourly pre-103 hook: %w", err)
	}
	if res.Skipped != "" {
		slog.Info("task_usage hourly rollup hook: skipped",
			"reason", res.Skipped,
			"watermark_stamped", res.WatermarkStamped)
		return nil
	}
	slog.Info("task_usage hourly rollup hook: backfill complete",
		"slices", res.SlicesProcessed,
		"rows_touched", res.RowsTouched,
		"from", res.From.Format("2006-01-02T15:04:05Z07:00"),
		"to", res.To.Format("2006-01-02T15:04:05Z07:00"))
	return nil
}

// runAttributionStrictHook backfills accountable_user_id from
// originator_user_id before migration 198 validates the strict attribution
// constraint, so self-hosted upgrades that never ran the out-of-band
// backfill recover automatically (GH #5544 / MUL-4897).
func runAttributionStrictHook(ctx context.Context, pool *pgxpool.Pool) error {
	res, err := attributionbackfill.Hook(ctx, pool, attributionbackfill.HookOptions{})
	if err != nil {
		return fmt.Errorf("attribution strict-constraint pre-198 hook: %w", err)
	}
	slog.Info("attribution backfill hook: complete",
		"rows_backfilled", res.RowsBackfilled,
		"batches", res.Batches,
		"mismatch_normalized", res.MismatchNormalized)
	return nil
}

// migrationAdvisoryLockKey is the int64 identifier used with Postgres
// pg_advisory_lock to serialize the migration loop across concurrent
// runners (multi-replica backend Deployment, scale-up, or a manual
// `migrate up` overlapping with pod startup). The exact value is
// arbitrary — it just needs to be stable across every process that runs
// migrations against the same database. See GitHub iteamify-ai/iteamify#3647.
const migrationAdvisoryLockKey int64 = 7244554146635925501

// defaultSchemaMigrationsTable is the unqualified name of the bookkeeping
// table that tracks which migrations have been applied. Tests override
// this so a concurrent-race harness can run against the same shared
// Postgres without colliding with the production table.
const defaultSchemaMigrationsTable = "schema_migrations"

const (
	defaultMigrationAdvisoryLockTimeout = 10 * time.Minute
	defaultMigrationLockTimeout         = 5 * time.Second
	defaultMigrationStatementTimeout    = 30 * time.Minute
)

const (
	migrationStatusApplying    = "applying"
	migrationStatusSucceeded   = "succeeded"
	migrationStatusFailed      = "failed"
	migrationStatusRollingBack = "rolling_back"
)

// runOptions carries everything runMigrations needs that is not the
// pool itself. Tests use it to inject a hermetic migrations directory,
// a unique per-test bookkeeping table, and a unique advisory-lock key
// that doesn't collide with any other migration runner sharing the same
// Postgres instance.
type runOptions struct {
	// Direction is "up" or "down".
	Direction string
	// Files is the ordered list of .sql files to apply. Production callers
	// pass migrations.Files(direction); tests pass a curated set written
	// to a t.TempDir().
	Files []string
	// SchemaMigrationsTable is the bookkeeping table to read/write.
	// May be schema-qualified (e.g. "migrate_test_xyz.schema_migrations").
	// Empty means defaultSchemaMigrationsTable.
	SchemaMigrationsTable string
	// AdvisoryLockKey is the int64 used with pg_advisory_lock. Zero means
	// migrationAdvisoryLockKey. Tests pass a unique key per run so
	// concurrent test workers do not block on the production migration
	// runner if it happens to share the database.
	AdvisoryLockKey int64
	// AdvisoryLockTimeout bounds how long this runner waits behind another
	// migration process. Zero uses defaultMigrationAdvisoryLockTimeout.
	AdvisoryLockTimeout time.Duration
	// LockTimeout bounds waits for table/row locks taken by migration SQL.
	// Zero uses defaultMigrationLockTimeout.
	LockTimeout time.Duration
	// StatementTimeout bounds each migration statement. Zero uses
	// defaultMigrationStatementTimeout.
	StatementTimeout time.Duration
	// Hooks maps migration version → pre-migration hook. The hook
	// receives the pool (not the loop's pinned conn) so it can take
	// its own session-level locks. nil or missing entries mean "no
	// hook" and the migration runs straight through. Production main()
	// passes preMigrationHooks; tests leave this nil.
	Hooks map[string]preMigrationHook
}

func main() {
	logger.Init()

	if len(os.Args) < 2 {
		fmt.Println("Usage: go run ./cmd/migrate <up|down>")
		os.Exit(1)
	}

	direction := os.Args[1]
	if direction != "up" && direction != "down" {
		fmt.Println("Usage: go run ./cmd/migrate <up|down>")
		os.Exit(1)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://iteamify:iteamify@localhost:5432/iteamify?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		slog.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("unable to ping database", "error", err)
		os.Exit(1)
	}

	files, err := migrations.Files(direction)
	if err != nil {
		slog.Error("failed to find migration files", "error", err)
		os.Exit(1)
	}

	advisoryLockTimeout, err := migrationDurationFromEnv(
		"ITEAMIFY_MIGRATION_ADVISORY_LOCK_TIMEOUT",
		defaultMigrationAdvisoryLockTimeout,
	)
	if err != nil {
		slog.Error("invalid migration advisory lock timeout", "error", err)
		os.Exit(1)
	}
	lockTimeout, err := migrationDurationFromEnv(
		"ITEAMIFY_MIGRATION_LOCK_TIMEOUT",
		defaultMigrationLockTimeout,
	)
	if err != nil {
		slog.Error("invalid migration lock timeout", "error", err)
		os.Exit(1)
	}
	statementTimeout, err := migrationDurationFromEnv(
		"ITEAMIFY_MIGRATION_STATEMENT_TIMEOUT",
		defaultMigrationStatementTimeout,
	)
	if err != nil {
		slog.Error("invalid migration statement timeout", "error", err)
		os.Exit(1)
	}

	if err := runMigrations(ctx, pool, runOptions{
		Direction:           direction,
		Files:               files,
		Hooks:               preMigrationHooks,
		AdvisoryLockTimeout: advisoryLockTimeout,
		LockTimeout:         lockTimeout,
		StatementTimeout:    statementTimeout,
	}); err != nil {
		slog.Error("migration run failed", "error", err)
		os.Exit(1)
	}

	fmt.Println("Done.")
}

func migrationDurationFromEnv(name string, fallback time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s=%q: %w", name, raw, err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("%s must be positive", name)
	}
	return d, nil
}

// runMigrations applies (direction="up") or rolls back (direction="down")
// the given file list against the supplied pool, serialized through a
// Postgres session-level advisory lock so multiple concurrent runners
// (multi-replica startup, scale-up, manual migrate overlap) take turns
// instead of racing each other.
//
// It is safe to invoke concurrently from multiple goroutines or
// processes against the same database with the same options: every
// caller blocks on pg_advisory_lock, and once it is their turn the
// already-applied EXISTS check turns each finished migration into a
// no-op skip. See GitHub iteamify-ai/iteamify#3647 / MUL-2923.
func runMigrations(ctx context.Context, pool *pgxpool.Pool, opts runOptions) error {
	switch opts.Direction {
	case "up", "down":
		// ok
	default:
		return fmt.Errorf("invalid direction %q (want \"up\" or \"down\")", opts.Direction)
	}

	table := opts.SchemaMigrationsTable
	if table == "" {
		table = defaultSchemaMigrationsTable
	}
	tableIdent, err := quoteQualifiedIdentifier(table)
	if err != nil {
		return fmt.Errorf("invalid schema migrations table %q: %w", table, err)
	}
	lockKey := opts.AdvisoryLockKey
	if lockKey == 0 {
		lockKey = migrationAdvisoryLockKey
	}
	advisoryLockTimeout := opts.AdvisoryLockTimeout
	if advisoryLockTimeout <= 0 {
		advisoryLockTimeout = defaultMigrationAdvisoryLockTimeout
	}
	lockTimeout := opts.LockTimeout
	if lockTimeout <= 0 {
		lockTimeout = defaultMigrationLockTimeout
	}
	statementTimeout := opts.StatementTimeout
	if statementTimeout <= 0 {
		statementTimeout = defaultMigrationStatementTimeout
	}

	// pg_advisory_lock is scoped to a single session, so we must pin one
	// *pgxpool.Conn for the whole run — calling pool.Exec would attach the
	// lock to a random connection that pgxpool could hand back out before
	// the loop finishes, making the lock effectively a no-op. We use the
	// blocking pg_advisory_lock (not pg_try_*) so a late-arriving runner
	// queues behind the current one instead of crash-looping; once it
	// acquires the lock the EXISTS checks below turn finished migrations
	// into no-op skips.
	//
	// We deliberately do NOT wrap the loop in a single transaction: the
	// repo already ships migrations using CREATE INDEX CONCURRENTLY,
	// which Postgres rejects inside a transaction block.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Release()

	lockCtx, cancelLock := context.WithTimeout(ctx, advisoryLockTimeout)
	defer cancelLock()
	if _, err := conn.Exec(lockCtx, "SELECT pg_advisory_lock($1)", lockKey); err != nil {
		return fmt.Errorf("acquire migration advisory lock: %w", err)
	}
	// Best-effort explicit unlock on the success path. On error returns
	// the defer still runs; on os.Exit error paths in main() it does not,
	// but session-level advisory locks are released automatically when
	// the connection closes at process exit, so the next runner is never
	// permanently blocked.
	defer func() {
		unlockCtx, cancelUnlock := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelUnlock()
		if _, err := conn.Exec(unlockCtx, "SELECT pg_advisory_unlock($1)", lockKey); err != nil {
			slog.Warn("failed to release migration advisory lock", "error", err)
		}
	}()

	if _, err := conn.Exec(ctx, `
		SELECT set_config('lock_timeout', $1, false),
		       set_config('statement_timeout', $2, false)
	`, postgresDuration(lockTimeout), postgresDuration(statementTimeout)); err != nil {
		return fmt.Errorf("configure migration timeouts: %w", err)
	}

	if err := ensureMigrationLedger(ctx, conn, tableIdent); err != nil {
		return err
	}
	if err := rejectUnknownMigrationVersions(ctx, conn, tableIdent, opts.Files); err != nil {
		return err
	}

	selectSQL := fmt.Sprintf("SELECT checksum, status FROM %s WHERE version = $1", tableIdent)
	insertSQL := fmt.Sprintf(`
		INSERT INTO %s (version, checksum, status, started_at, completed_at, error_text)
		VALUES ($1, $2, $3, now(), NULL, NULL)
	`, tableIdent)
	legacyChecksumSQL := fmt.Sprintf(`
		UPDATE %s
		SET checksum = $2,
		    completed_at = COALESCE(completed_at, applied_at)
		WHERE version = $1 AND checksum IS NULL
	`, tableIdent)
	startRollbackSQL := fmt.Sprintf(`
		UPDATE %s
		SET status = $2, started_at = now(), completed_at = NULL, error_text = NULL
		WHERE version = $1 AND status = $3
	`, tableIdent)
	finishSQL := fmt.Sprintf(`
		UPDATE %s
		SET status = $2, applied_at = now(), completed_at = now(), error_text = NULL
		WHERE version = $1 AND status = $3
	`, tableIdent)
	failSQL := fmt.Sprintf(`
		UPDATE %s
		SET status = $2, completed_at = now(), error_text = $3
		WHERE version = $1
	`, tableIdent)
	deleteSQL := fmt.Sprintf("DELETE FROM %s WHERE version = $1", tableIdent)

	for _, file := range opts.Files {
		version := migrations.ExtractVersion(file)
		sqlBytes, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read migration %q: %w", file, err)
		}
		checksum, err := expectedAppliedChecksum(file, sqlBytes, opts.Direction)
		if err != nil {
			return err
		}

		var storedChecksum sql.NullString
		var status string
		err = conn.QueryRow(ctx, selectSQL, version).Scan(&storedChecksum, &status)
		exists := err == nil
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("check migration %q: %w", version, err)
		}

		if opts.Direction == "up" {
			if exists {
				if status != migrationStatusSucceeded {
					return dirtyMigrationError(version, status)
				}
				if !storedChecksum.Valid {
					if _, err := conn.Exec(ctx, legacyChecksumSQL, version, checksum); err != nil {
						return fmt.Errorf("pin legacy migration checksum %q: %w", version, err)
					}
					fmt.Printf("  pin   %s (legacy checksum %s)\n", version, checksum)
				} else if storedChecksum.String != checksum {
					return checksumMismatchError(version, storedChecksum.String, checksum)
				}
				fmt.Printf("  skip  %s (already applied)\n", version)
				continue
			}
		} else {
			if !exists {
				fmt.Printf("  skip  %s (not applied)\n", version)
				continue
			}
			if status != migrationStatusSucceeded {
				return dirtyMigrationError(version, status)
			}
			if !storedChecksum.Valid {
				if _, err := conn.Exec(ctx, legacyChecksumSQL, version, checksum); err != nil {
					return fmt.Errorf("pin legacy migration checksum %q: %w", version, err)
				}
			} else if storedChecksum.String != checksum {
				return checksumMismatchError(version, storedChecksum.String, checksum)
			}
		}

		// Run any pre-migration hook before the SQL file. Hooks
		// receive the *pgxpool.Pool (not the loop's pinned conn), so
		// they can acquire other session-level locks without
		// colliding with migrationAdvisoryLockKey. Hook failures
		// abort the run before schema_migrations is updated, so the
		// same version retries cleanly on the next invocation.
		if opts.Direction == "up" {
			if hook, ok := opts.Hooks[version]; ok && hook != nil {
				slog.Info("running pre-migration hook", "version", version)
				if err := hook(ctx, pool); err != nil {
					return fmt.Errorf("pre-migration hook for %q: %w", version, err)
				}
			}
		}

		if opts.Direction == "up" {
			if _, err := conn.Exec(ctx, insertSQL, version, checksum, migrationStatusApplying); err != nil {
				return fmt.Errorf("record migration start %q: %w", version, err)
			}
		} else {
			tag, err := conn.Exec(ctx, startRollbackSQL, version, migrationStatusRollingBack, migrationStatusSucceeded)
			if err != nil {
				return fmt.Errorf("record migration rollback start %q: %w", version, err)
			}
			if tag.RowsAffected() != 1 {
				return fmt.Errorf("record migration rollback start %q: expected one row, updated %d", version, tag.RowsAffected())
			}
		}

		if _, err := conn.Exec(ctx, string(sqlBytes)); err != nil {
			recordMigrationFailure(conn, failSQL, version, err)
			return fmt.Errorf("apply migration %q: %w", file, err)
		}

		if opts.Direction == "up" {
			var tag pgconn.CommandTag
			tag, err = conn.Exec(ctx, finishSQL, version, migrationStatusSucceeded, migrationStatusApplying)
			if err == nil && tag.RowsAffected() != 1 {
				err = fmt.Errorf("expected one applying row, updated %d", tag.RowsAffected())
			}
		} else {
			_, err = conn.Exec(ctx, deleteSQL, version)
		}
		if err != nil {
			return fmt.Errorf("record migration %q: %w", version, err)
		}

		fmt.Printf("  %s  %s\n", opts.Direction, version)
	}

	return nil
}

func ensureMigrationLedger(ctx context.Context, conn *pgxpool.Conn, tableIdent string) error {
	statements := []string{
		fmt.Sprintf(`
			CREATE TABLE IF NOT EXISTS %s (
				version TEXT PRIMARY KEY,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				checksum TEXT,
				status TEXT NOT NULL DEFAULT 'succeeded',
				started_at TIMESTAMPTZ,
				completed_at TIMESTAMPTZ,
				error_text TEXT
			)
		`, tableIdent),
		fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS checksum TEXT", tableIdent),
		fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'succeeded'", tableIdent),
		fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ", tableIdent),
		fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ", tableIdent),
		fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS error_text TEXT", tableIdent),
		fmt.Sprintf(`
			UPDATE %s
			SET completed_at = applied_at
			WHERE status = 'succeeded' AND completed_at IS NULL
		`, tableIdent),
	}
	for _, statement := range statements {
		if _, err := conn.Exec(ctx, statement); err != nil {
			return fmt.Errorf("ensure migration ledger: %w", err)
		}
	}
	return nil
}

func rejectUnknownMigrationVersions(
	ctx context.Context,
	conn *pgxpool.Conn,
	tableIdent string,
	files []string,
) error {
	known := make(map[string]struct{}, len(files))
	for _, file := range files {
		known[migrations.ExtractVersion(file)] = struct{}{}
	}

	rows, err := conn.Query(ctx, fmt.Sprintf("SELECT version FROM %s ORDER BY version", tableIdent))
	if err != nil {
		return fmt.Errorf("inspect migration ledger: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("scan migration ledger: %w", err)
		}
		if _, ok := known[version]; !ok {
			return fmt.Errorf(
				"database contains unknown migration %q; refusing to run an older or incomplete migration catalog",
				version,
			)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("inspect migration ledger: %w", err)
	}
	return nil
}

func expectedAppliedChecksum(file string, contents []byte, direction string) (string, error) {
	if direction == "up" {
		return migrationChecksum(contents), nil
	}
	upFile := strings.TrimSuffix(file, ".down.sql") + ".up.sql"
	upContents, err := os.ReadFile(upFile)
	if err != nil {
		return "", fmt.Errorf("read matching up migration %q: %w", upFile, err)
	}
	return migrationChecksum(upContents), nil
}

func migrationChecksum(contents []byte) string {
	sum := sha256.Sum256(contents)
	return fmt.Sprintf("%x", sum[:])
}

func checksumMismatchError(version, stored, current string) error {
	return fmt.Errorf(
		"migration %q checksum mismatch: database=%s file=%s; historical migrations are immutable",
		version,
		stored,
		current,
	)
}

func dirtyMigrationError(version, status string) error {
	return fmt.Errorf(
		"migration %q is dirty (status=%s); inspect the database and repair the migration ledger before retrying",
		version,
		status,
	)
}

func recordMigrationFailure(conn *pgxpool.Conn, failSQL, version string, migrationErr error) {
	message := migrationErr.Error()
	if len(message) > 2000 {
		message = message[:2000]
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := conn.Exec(ctx, failSQL, version, migrationStatusFailed, message); err != nil {
		slog.Error("failed to record dirty migration", "version", version, "error", err)
	}
}

func postgresDuration(d time.Duration) string {
	return fmt.Sprintf("%dms", d.Milliseconds())
}

// quoteQualifiedIdentifier safely quotes either an unqualified table
// name ("foo") or a schema-qualified name ("schema.foo") for embedding
// into a SQL statement. Postgres does not let parametrized queries
// supply identifiers, so we have to interpolate, but pgx.Identifier
// does the right escaping (double-quotes, embedded-quote handling).
//
// The accepted shape is exactly one or two dot-separated components.
// Names containing more than one dot are rejected outright rather than
// silently sanitized into a "schema"."b.c" reference, which is valid
// SQL but almost certainly not what the caller meant.
func quoteQualifiedIdentifier(name string) (string, error) {
	if name == "" {
		return "", fmt.Errorf("empty identifier")
	}
	parts := strings.Split(name, ".")
	if len(parts) > 2 {
		return "", fmt.Errorf("identifier %q has more than one dot; only schema.table is supported", name)
	}
	for _, p := range parts {
		if p == "" {
			return "", fmt.Errorf("empty component in %q", name)
		}
	}
	return pgx.Identifier(parts).Sanitize(), nil
}

// Preflight precedes the immutable 567 SQL: a later migration cannot repair a
// database which fails before reaching it. Classification remains a human fact.
