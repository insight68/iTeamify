CREATE INDEX CONCURRENTLY idx_chat_agent_scope ON chat_session (workspace_id, creator_id, agent_id, status) WHERE kind = 'agent';
