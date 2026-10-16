CREATE UNIQUE INDEX CONCURRENTLY lark_installation_workspace_id_agent_id_key ON public.lark_installation USING btree (workspace_id, agent_id);
