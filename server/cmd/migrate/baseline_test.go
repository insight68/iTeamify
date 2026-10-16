package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestBaselineLifecycleAndStorageInvariants(t *testing.T) {
	f := newFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	cfg := f.pool.Config()
	cfg.ConnConfig.RuntimeParams["search_path"] = pgx.Identifier{f.schema}.Sanitize() + ", public"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	// Exercise the actual files and runner inside a private schema. Extension
	// operator classes remain in public, where CREATE EXTENSION installs them.
	dir := t.TempDir()
	files, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	var up, down []string
	for _, file := range files {
		body, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		sql := strings.ReplaceAll(string(body), "public.gin_trgm_ops", "gin_trgm_ops")
		sql = strings.ReplaceAll(sql, "public.", pgx.Identifier{f.schema}.Sanitize()+".")
		path := filepath.Join(dir, filepath.Base(file))
		if err := os.WriteFile(path, []byte(sql), 0o600); err != nil {
			t.Fatal(err)
		}
		if strings.HasSuffix(file, ".up.sql") {
			up = append(up, path)
		} else {
			down = append(down, path)
		}
	}
	if len(up) == 0 || len(up) != len(down) {
		t.Fatalf("incomplete baseline: %d up / %d down", len(up), len(down))
	}
	sort.Strings(up)
	sort.Sort(sort.Reverse(sort.StringSlice(down)))
	opts := f.opts()
	opts.Files = up
	for i := 0; i < 2; i++ {
		if err := runMigrations(ctx, pool, opts); err != nil {
			t.Fatalf("baseline up (run %d): %v", i+1, err)
		}
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+f.tableFQN+" WHERE status='succeeded'").Scan(&count); err != nil || count != len(up) {
		t.Fatalf("ledger: %d rows, want %d: %v", count, len(up), err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_constraint WHERE connamespace=$1::regnamespace AND contype='f'`, f.schema).Scan(&count); err != nil || count != 0 {
		t.Fatalf("baseline has %d database foreign keys: %v", count, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace=$1::regnamespace AND NOT i.indisvalid`, f.schema).Scan(&count); err != nil || count != 0 {
		t.Fatalf("baseline has %d invalid indexes: %v", count, err)
	}
	for _, table := range []string{"leads", "accounts", "service_quote", "public_expert_page", "managed_asset_release", "platform_openagent_config", "trash_idea", "direct_conversation", "direct_message", "task_usage_daily"} {
		var exists bool
		if err := pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", f.schema+"."+table).Scan(&exists); err != nil || exists {
			t.Errorf("retired table %s remains: %v", table, err)
		}
	}
	for _, query := range []string{
		`SELECT count(*) FROM billing_settings WHERE singleton AND credits_micro_per_usd=0`,
		`SELECT count(*) FROM task_usage_hourly_rollup_state WHERE id=1 AND watermark_at BETWEEN now()-interval '10 minutes' AND now()`,
		`SELECT count(*) FROM token_credit_rate WHERE version=1 AND credits_micro_per_million_tokens=1000000000 AND active`,
	} {
		if err := pool.QueryRow(ctx, query).Scan(&count); err != nil || count != 1 {
			t.Errorf("installation default: %s: count=%d err=%v", query, count, err)
		}
	}
	testBaselineChecks(t, ctx, pool)

	opts.Direction, opts.Files = "down", down
	if err := runMigrations(ctx, pool, opts); err != nil {
		t.Fatalf("baseline down: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+f.tableFQN).Scan(&count); err != nil || count != 0 {
		t.Fatalf("ledger after down: %d %v", count, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_class WHERE relnamespace=$1::regnamespace AND relkind IN ('r','v','S') AND relname<>'schema_migrations'`, f.schema).Scan(&count); err != nil || count != 0 {
		t.Fatalf("objects after down: %d %v", count, err)
	}
	opts.Direction, opts.Files = "up", up
	if err := runMigrations(ctx, pool, opts); err != nil {
		t.Fatalf("baseline up after down: %v", err)
	}
}

func testBaselineChecks(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Release()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := conn.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	reject := func(code, sql string, args ...any) {
		t.Helper()
		_, err := conn.Exec(ctx, sql, args...)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != code {
			t.Fatalf("%s: got %v, want SQLSTATE %s", sql, err, code)
		}
	}
	wid, user, peer, agent, runtime := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO runtime_profile(workspace_id,display_name,protocol_family,command_name) VALUES($1,'future','future_backend','future')`, wid)
	reject("23514", `INSERT INTO runtime_profile(workspace_id,display_name,protocol_family,command_name) VALUES($1,'invalid','Invalid Family','future')`, wid)
	exec(`INSERT INTO agent(id,workspace_id,name,runtime_id,runtime_mode,execution_policy_key) VALUES($1,$2,'assistant',$3,'cloud','workspace_openagent_v1')`, agent, wid, runtime)
	reject("23514", `UPDATE agent SET execution_policy_key='workspace_managed_claude_v1' WHERE id=$1`, agent)
	reject("23514", `UPDATE agent SET execution_policy_key='managed_chat_v1' WHERE id=$1`, agent)
	exec(`INSERT INTO agent_task_queue(agent_id,runtime_id,originator_user_id,accountable_user_id) VALUES($1,$2,$3,$3)`, agent, runtime, user)
	reject("23514", `INSERT INTO agent_task_queue(agent_id,runtime_id,originator_user_id) VALUES($1,$2,$3)`, agent, runtime, user)
	reject("23514", `INSERT INTO agent_task_queue(agent_id,runtime_id,originator_user_id,accountable_user_id) VALUES($1,$2,$3,$4)`, agent, runtime, user, peer)
	var sid string
	if err := conn.QueryRow(ctx, `INSERT INTO chat_session(workspace_id,creator_id,peer_user_id,kind) VALUES($1,$2,$3,'direct') RETURNING id`, wid, user, peer).Scan(&sid); err != nil {
		t.Fatal(err)
	}
	messageID := uuid.NewString()
	exec(`INSERT INTO chat_message(chat_session_id,sender_id,client_message_id,sequence,role,content) VALUES($1,$2,$3,1,'user','hello')`, sid, user, messageID)
	reject("23505", `INSERT INTO chat_message(chat_session_id,sender_id,client_message_id,sequence,role,content) VALUES($1,$2,$3,1,'user','duplicate sequence')`, sid, user, uuid.NewString())
	reject("23505", `INSERT INTO chat_message(chat_session_id,sender_id,client_message_id,sequence,role,content) VALUES($1,$2,$3,2,'user','duplicate client ID')`, sid, user, messageID)
	reject("23514", `INSERT INTO chat_message(chat_session_id,sender_id,client_message_id,sequence,role,content) VALUES($1,$2,$3,0,'user','invalid sequence')`, sid, user, uuid.NewString())
	reject("23514", `UPDATE chat_session SET creator_read_sequence=1 WHERE id=$1`, sid)
	// The rollup uses NULLS NOT DISTINCT to deduplicate buckets with no project.
	exec(`INSERT INTO task_usage_hourly_dirty(bucket_hour,workspace_id,runtime_id,agent_id,provider,model) VALUES(date_trunc('hour',now()),$1,$2,$3,'test','test')`, wid, runtime, agent)
	reject("23505", `INSERT INTO task_usage_hourly_dirty(bucket_hour,workspace_id,runtime_id,agent_id,provider,model) VALUES(date_trunc('hour',now()),$1,$2,$3,'test','test')`, wid, runtime, agent)
}
