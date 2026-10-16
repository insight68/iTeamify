CREATE INDEX CONCURRENTLY gmail_message_connection_date_idx ON public.gmail_message USING btree (connection_id, internal_date DESC);
