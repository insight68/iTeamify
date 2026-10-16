CREATE INDEX CONCURRENTLY gmail_sync_job_claim_idx ON gmail_sync_job (available_at, updated_at) WHERE status IN ('pending', 'processing');
