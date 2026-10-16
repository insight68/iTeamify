CREATE INDEX CONCURRENTLY gmail_message_connection_analysis_idx ON public.gmail_message USING btree (connection_id, analysis_status);
