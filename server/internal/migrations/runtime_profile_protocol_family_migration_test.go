package migrations

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRuntimeProfileProtocolFamilyShapeMigration(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("integration test requires Postgres at DATABASE_URL")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to Postgres: %v", err)
	}
	defer pool.Close()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire Postgres connection: %v", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `
		CREATE TEMP TABLE runtime_profile (
			id UUID PRIMARY KEY,
			protocol_family TEXT NOT NULL,
			CONSTRAINT runtime_profile_protocol_family_check
				CHECK (protocol_family IN ('codex', 'openagent'))
		)
	`); err != nil {
		t.Fatalf("create temporary runtime_profile table: %v", err)
	}

	applyMigrationFile(t, ctx, conn.Conn(), "458_runtime_profile_protocol_family_shape.up.sql")

	if _, err := conn.Exec(ctx, `
		INSERT INTO runtime_profile (id, protocol_family)
		VALUES ('00000000-0000-0000-0000-000000000001', 'future_backend')
	`); err != nil {
		t.Fatalf("insert future release-owned protocol family: %v", err)
	}
	assertInsertCheckViolation(t, ctx, conn.Conn(), `
		INSERT INTO runtime_profile (id, protocol_family)
		VALUES ('00000000-0000-0000-0000-000000000002', 'Invalid Family')
	`)

	applyMigrationFile(t, ctx, conn.Conn(), "458_runtime_profile_protocol_family_shape.down.sql")
	assertInsertCheckViolation(t, ctx, conn.Conn(), `
		INSERT INTO runtime_profile (id, protocol_family)
		VALUES ('00000000-0000-0000-0000-000000000003', 'another_future_backend')
	`)
}
