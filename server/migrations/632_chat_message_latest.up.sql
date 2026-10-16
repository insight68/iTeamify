CREATE INDEX CONCURRENTLY idx_chat_message_latest ON chat_message (chat_session_id, created_at DESC, id DESC);
