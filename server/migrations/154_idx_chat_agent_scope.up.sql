CREATE INDEX CONCURRENTLY idx_chat_agent_scope ON public.chat_session USING btree (workspace_id, creator_id, agent_id, status) WHERE (kind = 'agent'::text);
