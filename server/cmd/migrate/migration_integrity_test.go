package main

import (
	"context"
	"fmt"
	"os"

	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestMigrationDurationFromEnv(t *testing.T) {
	const name = "ITEAMIFY_TEST_MIGRATION_TIMEOUT"

	t.Setenv(name, "")
	got, err := migrationDurationFromEnv(name, 7*time.Second)
	if err != nil || got != 7*time.Second {
		t.Fatalf("fallback = %s, %v; want 7s, nil", got, err)
	}

	t.Setenv(name, "250ms")
	got, err = migrationDurationFromEnv(name, 7*time.Second)
	if err != nil || got != 250*time.Millisecond {
		t.Fatalf("configured = %s, %v; want 250ms, nil", got, err)
	}

	for _, invalid := range []string{"0", "-1s", "not-a-duration"} {
		t.Setenv(name, invalid)
		if _, err := migrationDurationFromEnv(name, time.Second); err == nil {
			t.Errorf("value %q: expected error, got nil", invalid)
		}
	}
}

func TestMigrationChecksumChangesWithFileContents(t *testing.T) {
	first := migrationChecksum([]byte("SELECT 1;\n"))
	second := migrationChecksum([]byte("SELECT 1;\n-- changed\n"))
	if len(first) != 64 {
		t.Fatalf("checksum length = %d, want 64", len(first))
	}
	if first == second {
		t.Fatal("different migration contents produced the same checksum")
	}
}

func TestRunMigrationsPinsAndRejectsChecksumDrift(t *testing.T) {
	f := newFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), raceTestTimeout)
	defer cancel()

	if err := runMigrations(ctx, f.pool, f.opts()); err != nil {
		t.Fatalf("initial migration run: %v", err)
	}

	version := f.versions[0]
	var checksum, status string
	if err := f.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT checksum, status
		FROM %s
		WHERE version = $1
	`, pgx.Identifier{f.schema, "schema_migrations"}.Sanitize()), version).Scan(&checksum, &status); err != nil {
		t.Fatalf("read migration integrity fields: %v", err)
	}
	if len(checksum) != 64 || status != migrationStatusSucceeded {
		t.Fatalf("checksum/status = %q/%q, want 64-char checksum/succeeded", checksum, status)
	}

	file := f.files[0]
	contents, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, append(contents, []byte("-- historical edit\n")...), 0o600); err != nil {
		t.Fatal(err)
	}

	err = runMigrations(ctx, f.pool, f.opts())
	if err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("checksum drift error = %v, want checksum mismatch", err)
	}
}

func TestRunMigrationsMarksFailedSQLDirty(t *testing.T) {
	f := newFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), raceTestTimeout)
	defer cancel()

	file := f.files[0]
	body := fmt.Sprintf(
		"CREATE TABLE %s.%s (id BIGSERIAL PRIMARY KEY);\nSELECT 1 / 0;\n",
		pgx.Identifier{f.schema}.Sanitize(),
		pgx.Identifier{f.tableNames[0]}.Sanitize(),
	)
	if err := os.WriteFile(file, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	opts := f.opts()
	opts.Files = []string{file}

	err := runMigrations(ctx, f.pool, opts)
	if err == nil || !strings.Contains(err.Error(), "division by zero") {
		t.Fatalf("failed migration error = %v, want division by zero", err)
	}

	var status string
	var errorText string
	if err := f.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT status, error_text
		FROM %s
		WHERE version = $1
	`, pgx.Identifier{f.schema, "schema_migrations"}.Sanitize()), f.versions[0]).Scan(&status, &errorText); err != nil {
		t.Fatalf("read dirty migration: %v", err)
	}
	if status != migrationStatusFailed || !strings.Contains(errorText, "division by zero") {
		t.Fatalf("dirty migration = %q/%q, want failed/division by zero", status, errorText)
	}

	err = runMigrations(ctx, f.pool, opts)
	if err == nil || !strings.Contains(err.Error(), "is dirty") {
		t.Fatalf("dirty retry error = %v, want dirty migration refusal", err)
	}
}

func TestRunMigrationsRejectsUnknownLedgerVersion(t *testing.T) {
	f := newFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), raceTestTimeout)
	defer cancel()

	if err := runMigrations(ctx, f.pool, f.opts()); err != nil {
		t.Fatalf("initial migration run: %v", err)
	}
	if _, err := f.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s (version, checksum, status)
		VALUES ('999_future', repeat('a', 64), 'succeeded')
	`, pgx.Identifier{f.schema, "schema_migrations"}.Sanitize())); err != nil {
		t.Fatalf("insert unknown migration: %v", err)
	}

	err := runMigrations(ctx, f.pool, f.opts())
	if err == nil || !strings.Contains(err.Error(), "unknown migration") {
		t.Fatalf("unknown migration error = %v, want refusal", err)
	}
}
