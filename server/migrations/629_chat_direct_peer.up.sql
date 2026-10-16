CREATE INDEX CONCURRENTLY idx_chat_direct_peer ON chat_session (workspace_id, peer_user_id, creator_id, (COALESCE(direct_last_message_at, created_at)) DESC, id DESC) WHERE kind = 'direct';
