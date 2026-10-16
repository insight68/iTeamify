package migrations

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
	"os"
	"testing"
	"time"
)

func TestTemplateRetirementPreservesWorkspaceOpenAgentContent(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("database not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	schema := pgx.Identifier{fmt.Sprintf("template_retirement_%d", time.Now().UnixNano())}.Sanitize()
	if _, err = tx.Exec(ctx, "CREATE SCHEMA "+schema+"; SET LOCAL search_path TO "+schema); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `
 CREATE TABLE agent_runtime(id uuid,workspace_id uuid,daemon_id text,provider text,profile_id uuid,created_at timestamptz,offering_release_id uuid,managed_content_hash text,provisioning_operation_id uuid,managed_at timestamptz,managed_state text);
 INSERT INTO agent_runtime VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','shared','openagent',NULL,now(),NULL,NULL,NULL,NULL,NULL),('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','shared','openagent',NULL,now(),gen_random_uuid(),NULL,NULL,NULL,'active');
 CREATE TABLE agent(id text,runtime_id uuid,instructions text,execution_policy_key text,managed_release_id uuid,managed_content_hash text,provisioning_operation_id uuid,managed_mcp_release_ids uuid[],managed_at timestamptz,managed_state text);
 INSERT INTO agent(id,runtime_id,instructions,execution_policy_key) VALUES ('existing','00000000-0000-0000-0000-000000000002','keep these instructions','managed_chat_v1');
 CREATE TABLE skill(id text,content text,managed_release_id uuid,managed_content_hash text,provisioning_operation_id uuid,managed_at timestamptz,managed_state text);INSERT INTO skill(id,content) VALUES('existing','keep this content');
 CREATE TABLE agent_task_queue(id text,runtime_id uuid,provisioning_operation_id uuid,managed_probe_nonce text);INSERT INTO agent_task_queue VALUES('real','00000000-0000-0000-0000-000000000002',NULL,NULL),('probe','00000000-0000-0000-0000-000000000002',gen_random_uuid(),'probe-nonce');
 `); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, readMigrationFile(t, "658_remove_template_provisioning_admin.up.sql")); err != nil {
		t.Fatal(err)
	}
	var content, policy, id string
	if err = tx.QueryRow(ctx, `SELECT instructions,execution_policy_key,runtime_id::text FROM agent`).Scan(&content, &policy, &id); err != nil || content != "keep these instructions" || policy != "workspace_openagent_v1" || id != "00000000-0000-0000-0000-000000000001" {
		t.Fatalf("retained agent changed: %s %s %s %v", content, policy, id, err)
	}
	if err = tx.QueryRow(ctx, `SELECT content FROM skill`).Scan(&content); err != nil || content != "keep this content" {
		t.Fatal("retained Skill changed")
	}
	if err = tx.QueryRow(ctx, `SELECT id FROM agent_task_queue`).Scan(&id); err != nil || id != "real" {
		t.Fatal("real task lost or readiness task retained")
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM agent_runtime`).Scan(&count); err != nil || count != 1 {
		t.Fatal("runtime bindings not consolidated")
	}
}
