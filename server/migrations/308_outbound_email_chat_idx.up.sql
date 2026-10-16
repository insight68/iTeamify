CREATE INDEX CONCURRENTLY outbound_email_chat_idx ON public.outbound_email USING btree (workspace_id, user_id, chat_session_id, created_at DESC);
