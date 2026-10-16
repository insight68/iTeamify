CREATE INDEX CONCURRENTLY user_gmail_connection_user_status_idx ON public.user_gmail_connection USING btree (user_id, status);
