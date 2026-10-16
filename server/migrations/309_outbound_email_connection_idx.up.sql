CREATE INDEX CONCURRENTLY outbound_email_connection_idx ON public.outbound_email USING btree (connection_id);
