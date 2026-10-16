CREATE UNIQUE INDEX CONCURRENTLY notification_preference_workspace_id_user_id_key ON public.notification_preference USING btree (workspace_id, user_id);
