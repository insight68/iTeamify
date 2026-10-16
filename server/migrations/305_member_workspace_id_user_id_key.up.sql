CREATE UNIQUE INDEX CONCURRENTLY member_workspace_id_user_id_key ON public.member USING btree (workspace_id, user_id);
