CREATE UNIQUE INDEX CONCURRENTLY user_gmail_connection_user_email_uidx ON public.user_gmail_connection USING btree (user_id, lower(email_address));
