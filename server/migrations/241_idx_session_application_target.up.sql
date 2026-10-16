CREATE UNIQUE INDEX CONCURRENTLY idx_session_application_target ON public.session_application USING btree (workspace_id, target_kind, target_id, application_type);
