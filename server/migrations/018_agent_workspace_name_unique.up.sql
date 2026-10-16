CREATE UNIQUE INDEX CONCURRENTLY agent_workspace_name_unique ON public.agent USING btree (workspace_id, name);
