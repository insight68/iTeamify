package migrations

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestRetiredBusinessMigrationPreservesActiveData(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("integration test requires Postgres at DATABASE_URL")
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
	schema := pgx.Identifier{fmt.Sprintf("retired_business_test_%d", time.Now().UnixNano())}.Sanitize()
	if _, err = tx.Exec(ctx, "CREATE SCHEMA "+schema+"; SET LOCAL search_path TO "+schema); err != nil {
		t.Fatal(err)
	}
	migration := readMigrationFile(t, "655_drop_retired_business_modules.up.sql")
	tables := regexp.MustCompile(`DROP TABLE IF EXISTS (\w+);`).FindAllStringSubmatch(migration, -1)
	for _, table := range tables {
		if _, err = tx.Exec(ctx, "CREATE TABLE "+pgx.Identifier{table[1]}.Sanitize()+" (id text)"); err != nil {
			t.Fatal(err)
		}
	}
	_, err = tx.Exec(ctx, `CREATE VIEW crm_customer_records AS SELECT id FROM accounts;
 CREATE TABLE outbound_email (id text, body text, lead_id text, account_id text);
 INSERT INTO outbound_email VALUES ('email','keep this draft','old-lead','old-account');
 CREATE TABLE mcp_tool_invocation (id text, surface text);
 INSERT INTO mcp_tool_invocation VALUES ('normal','agent_task'),('retired','public_sales');
 CREATE TABLE billing_settings (singleton boolean, credits_micro_per_usd bigint, customer_pool_price_micro bigint, customer_pool_price_version integer);
 INSERT INTO billing_settings VALUES (true,100,55,1);
 CREATE TABLE agent (id text, mcp_config jsonb);
 INSERT INTO agent VALUES ('assistant','{"mcpServers":{"iteamify":{"env":{"ITEAMIFY_MCP_TOOL_ALLOWLIST":"resource_catalog,lead_search,quote_list,table_query,web_search"}},"custom":{"command":"keep"}}}');
 CREATE TABLE workspace (id text); INSERT INTO workspace VALUES ('workspace');
 CREATE TABLE issue (id text); INSERT INTO issue VALUES ('task');
 CREATE TABLE chat_session (id text); INSERT INTO chat_session VALUES ('chat');
 CREATE TABLE workspace_credit_account (id text); INSERT INTO workspace_credit_account VALUES ('credits');
 CREATE TABLE agent_task_queue (id text); INSERT INTO agent_task_queue VALUES ('queue');`)
	if err != nil {
		t.Fatal(err)
	}
	// Applying twice also verifies clean installation and already-retired schemas.
	for i := 0; i < 2; i++ {
		if _, err = tx.Exec(ctx, migration+"\n"+readMigrationFile(t, "656_remove_retired_business_shared_settings.up.sql")); err != nil {
			t.Fatal(err)
		}
	}
	for _, table := range tables {
		var exists bool
		if err = tx.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", table[1]).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if exists {
			t.Errorf("retired table remains: %s", table[1])
		}
	}
	for table, want := range map[string]string{"workspace": "workspace", "issue": "task", "chat_session": "chat", "workspace_credit_account": "credits", "agent_task_queue": "queue"} {
		var id string
		if err = tx.QueryRow(ctx, "SELECT id FROM "+pgx.Identifier{table}.Sanitize()).Scan(&id); err != nil || id != want {
			t.Fatalf("active %s changed: %q, %v", table, id, err)
		}
	}
	var credits int64
	if err = tx.QueryRow(ctx, "SELECT credits_micro_per_usd FROM billing_settings").Scan(&credits); err != nil || credits != 100 {
		t.Fatalf("billing settings changed: %d, %v", credits, err)
	}
	var allowlist, custom string
	if err = tx.QueryRow(ctx, `SELECT mcp_config #>> '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}', mcp_config #>> '{mcpServers,custom,command}' FROM agent`).Scan(&allowlist, &custom); err != nil || allowlist != "resource_catalog,web_search" || custom != "keep" {
		t.Fatalf("MCP config cleanup failed: %q, %q, %v", allowlist, custom, err)
	}
	var body, invocation string
	if err = tx.QueryRow(ctx, "SELECT body FROM outbound_email WHERE id='email'").Scan(&body); err != nil || body != "keep this draft" {
		t.Fatalf("email changed: %q, %v", body, err)
	}
	if err = tx.QueryRow(ctx, "SELECT id FROM mcp_tool_invocation").Scan(&invocation); err != nil || invocation != "normal" {
		t.Fatalf("active telemetry changed: %q, %v", invocation, err)
	}
	var removedColumnCount int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='outbound_email' AND column_name IN ('lead_id','account_id')`).Scan(&removedColumnCount); err != nil || removedColumnCount != 0 {
		t.Fatalf("retired email links remain: %d, %v", removedColumnCount, err)
	}
}
