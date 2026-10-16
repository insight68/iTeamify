CREATE INDEX CONCURRENTLY gmail_message_body_cleanup_idx ON public.gmail_message USING btree (created_at) WHERE (body_text <> ''::text);
