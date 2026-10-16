CREATE UNIQUE INDEX CONCURRENTLY idx_chat_message_sequence ON chat_message (chat_session_id, sequence) WHERE sequence IS NOT NULL;
