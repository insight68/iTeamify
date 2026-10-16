CREATE INDEX CONCURRENTLY gmail_sync_job_claim_idx ON public.gmail_sync_job USING btree (available_at, updated_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
