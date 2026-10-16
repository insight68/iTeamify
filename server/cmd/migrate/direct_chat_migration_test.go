package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func TestDirectChatMigrationPreservesHistoryAndRejectsBrokenSequences(t *testing.T) {
	raw := os.Getenv("DATABASE_URL")
	if raw == "" {
		t.Skip("requires an explicit disposable DATABASE_URL")
	}
	for _, name := range []string{"preserves history", "rejects count mismatch", "rejects sequence gap"} {
		broken := name != "preserves history"
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			conn, err := pgx.Connect(ctx, raw)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close(ctx)
			schema := pgx.Identifier{"direct_migration_" + strings.ReplaceAll(uuid.NewString(), "-", "")}.Sanitize()
			if _, err = conn.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
				t.Fatal(err)
			}
			defer func() {
				conn.Exec(ctx, "ROLLBACK")
				if _, err := conn.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
					t.Error(err)
				}
			}()
			if _, err = conn.Exec(ctx, "SET search_path TO "+schema+", public"); err != nil {
				t.Fatal(err)
			}
			_, err = conn.Exec(ctx, `CREATE TABLE chat_session (
    id UUID PRIMARY KEY,workspace_id UUID NOT NULL,agent_id UUID NOT NULL,creator_id UUID NOT NULL,
    title TEXT NOT NULL DEFAULT '',runtime_id UUID,project_id UUID,session_id TEXT,work_dir TEXT,
    status TEXT NOT NULL DEFAULT 'active',pinned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE chat_message (id UUID PRIMARY KEY,chat_session_id UUID NOT NULL,role TEXT NOT NULL,
    content TEXT NOT NULL,task_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT now());`)
			if err != nil {
				t.Fatal(err)
			}
			apply := func(file string) error {
				body, err := os.ReadFile(filepath.Join("..", "..", "migrations", file))
				if err != nil {
					return err
				}
				_, err = conn.Exec(ctx, string(body))
				return err
			}
			for _, file := range []string{"618_direct_messages.up.sql", "619_direct_conversation_id.up.sql", "620_direct_conversation_pair.up.sql", "622_direct_message_id.up.sql", "623_direct_message_sequence.up.sql", "624_direct_message_idempotency.up.sql"} {
				if err := apply(file); err != nil {
					t.Fatal(err)
				}
			}
			sid, wid, agent, low, high := uuid.NewString(), uuid.NewString(), uuid.NewString(), "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"
			_, err = conn.Exec(ctx, `INSERT INTO direct_conversation(id,workspace_id,user_low_id,user_high_id,last_sequence,low_read_sequence,high_read_sequence,last_message_at) VALUES($1,$2,$3,$4,2,2,1,'2026-10-09T01:02:03.123456Z');
    `, sid, wid, low, high)
			if err != nil {
				t.Fatal(err)
			}
			for seq := 1; seq <= 2; seq++ {
				_, err = conn.Exec(ctx, `INSERT INTO direct_message(workspace_id,conversation_id,sender_id,client_message_id,sequence,content,created_at) VALUES($1,$2,$3,$4,$5,$6,'2026-10-09T01:02:03.123456Z')`, wid, sid, low, uuid.NewString(), seq, "历史消息 "+strings.Repeat("内容", seq))
				if err != nil {
					t.Fatal(err)
				}
			}
			if _, err = conn.Exec(ctx, `INSERT INTO chat_session(id,workspace_id,agent_id,creator_id,title) VALUES($1,$2,$3,$4,'AI history')`, uuid.NewString(), wid, agent, low); err != nil {
				t.Fatal(err)
			}
			if name == "rejects count mismatch" {
				if _, err = conn.Exec(ctx, `UPDATE direct_conversation SET last_sequence=3 WHERE id=$1`, sid); err != nil {
					t.Fatal(err)
				}
			}
			if name == "rejects sequence gap" {
				if _, err = conn.Exec(ctx, `UPDATE direct_message SET sequence=3 WHERE conversation_id=$1 AND sequence=2`, sid); err != nil {
					t.Fatal(err)
				}
			}
			for _, file := range []string{"625_chat_participants.up.sql", "626_chat_message_sequence.up.sql", "627_chat_message_client_id.up.sql", "628_chat_direct_creator.up.sql", "629_chat_direct_peer.up.sql"} {
				if err := apply(file); err != nil {
					t.Fatal(err)
				}
			}
			err = apply("630_chat_direct_history.up.sql")
			if broken {
				if err == nil {
					t.Fatal("broken legacy sequence accepted")
				}
				conn.Exec(ctx, "ROLLBACK")
				var count int
				if err := conn.QueryRow(ctx, `SELECT count(*) FROM chat_session WHERE kind='direct'`).Scan(&count); err != nil || count != 0 {
					t.Fatalf("failed copy was not atomic: %d %v", count, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var valid bool
			err = conn.QueryRow(ctx, `SELECT s.creator_read_sequence=2 AND s.peer_read_sequence=1 AND s.last_sequence=2 AND s.kind='direct' AND s.agent_id IS NULL
    AND (SELECT count(*) FROM chat_message m JOIN direct_message d ON d.id=m.id WHERE m.chat_session_id=s.id AND m.sequence=d.sequence AND m.sender_id=d.sender_id AND m.client_message_id=d.client_message_id AND m.content=d.content AND m.created_at=d.created_at)=2
    FROM chat_session s WHERE s.id=$1`, sid).Scan(&valid)
			if err != nil || !valid {
				t.Fatalf("history or cursor changed: %v", err)
			}
			if err := apply("633_drop_direct_tables.up.sql"); err != nil {
				t.Fatal(err)
			}
			var count int
			if err := conn.QueryRow(ctx, `SELECT count(*) FROM chat_session`).Scan(&count); err != nil || count != 2 {
				t.Fatalf("cleanup lost history: %d %v", count, err)
			}
		})
	}
}
