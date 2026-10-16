CREATE UNIQUE INDEX CONCURRENTLY skill_workspace_id_name_key ON public.skill USING btree (workspace_id, name);
