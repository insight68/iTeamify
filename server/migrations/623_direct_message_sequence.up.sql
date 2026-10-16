CREATE UNIQUE INDEX CONCURRENTLY direct_message_sequence_idx ON direct_message (workspace_id, conversation_id, sequence);
