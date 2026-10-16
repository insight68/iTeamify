CREATE INDEX CONCURRENTLY service_quote_workspace_chat_created_idx ON service_quote (workspace_id, chat_session_id, created_at);
