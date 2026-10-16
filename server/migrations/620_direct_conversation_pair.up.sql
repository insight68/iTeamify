CREATE UNIQUE INDEX CONCURRENTLY direct_conversation_pair_idx ON direct_conversation (workspace_id, user_low_id, user_high_id);
