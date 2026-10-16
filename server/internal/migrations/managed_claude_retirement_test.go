package migrations

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestManagedClaudeRetirementPreservesOpenAgentAndLocalClaude(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("integration test requires DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(context.Background())
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	schema := pgx.Identifier{fmt.Sprintf("managed_claude_retirement_%d", time.Now().UnixNano())}.Sanitize()
	if _, err = tx.Exec(ctx, "CREATE SCHEMA "+schema+"; SET LOCAL search_path TO "+schema); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `
 CREATE TABLE agent (id text, execution_policy_key text CONSTRAINT agent_execution_policy_key_check CHECK (execution_policy_key IN ('general','managed_chat_v1','workspace_openagent_v1','workspace_managed_claude_v1')));
 INSERT INTO agent VALUES ('local-claude','general'),('installed-openagent','managed_chat_v1'),('authored-openagent','workspace_openagent_v1');
 CREATE TABLE agent_runtime (id text,provider text); INSERT INTO agent_runtime VALUES ('local','claude'),('shared','openagent');
 CREATE TABLE managed_asset_release (id text); INSERT INTO managed_asset_release VALUES ('template');
 CREATE TABLE new_workspace_provisioning_policy (enabled boolean); INSERT INTO new_workspace_provisioning_policy VALUES (true);
 `); err != nil {
		t.Fatal(err)
	}
	migration := readMigrationFile(t, "657_remove_managed_claude_execution_policy.up.sql")
	for i := 0; i < 2; i++ {
		if _, err = tx.Exec(ctx, migration); err != nil {
			t.Fatal(err)
		}
	}
	for table, want := range map[string]int{"agent": 3, "agent_runtime": 2, "managed_asset_release": 1, "new_workspace_provisioning_policy": 1} {
		var count int
		if err = tx.QueryRow(ctx, "SELECT count(*) FROM "+pgx.Identifier{table}.Sanitize()).Scan(&count); err != nil || count != want {
			t.Fatalf("%s count=%d err=%v", table, count, err)
		}
	}
	savepoint, err := tx.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = savepoint.Exec(ctx, `INSERT INTO agent VALUES ('retired','workspace_managed_claude_v1')`)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("retired policy accepted: %v", err)
	}
	if err = savepoint.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var enabled bool
	if err = tx.QueryRow(ctx, `SELECT enabled FROM new_workspace_provisioning_policy`).Scan(&enabled); err != nil || !enabled {
		t.Fatalf("workspace initialization changed: enabled=%v err=%v", enabled, err)
	}
}
