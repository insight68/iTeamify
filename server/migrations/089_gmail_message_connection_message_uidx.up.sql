CREATE UNIQUE INDEX CONCURRENTLY gmail_message_connection_message_uidx ON public.gmail_message USING btree (connection_id, gmail_message_id);
