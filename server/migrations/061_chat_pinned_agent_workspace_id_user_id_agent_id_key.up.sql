CREATE UNIQUE INDEX CONCURRENTLY chat_pinned_agent_workspace_id_user_id_agent_id_key ON public.chat_pinned_agent USING btree (workspace_id, user_id, agent_id);
