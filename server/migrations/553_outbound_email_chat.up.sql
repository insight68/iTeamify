CREATE INDEX CONCURRENTLY outbound_email_chat_idx ON outbound_email (workspace_id, user_id, chat_session_id, created_at DESC);
