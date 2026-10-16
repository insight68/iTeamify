CREATE INDEX CONCURRENTLY outbound_email_queue_idx ON public.outbound_email USING btree (available_at) WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text]));
