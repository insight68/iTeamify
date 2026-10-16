CREATE INDEX CONCURRENTLY user_gmail_connection_email_active_idx ON public.user_gmail_connection USING btree (lower(email_address)) WHERE (status = ANY (ARRAY['active'::text, 'attention'::text]));
