CREATE INDEX CONCURRENTLY gmail_message_analysis_claim_idx ON gmail_message (analysis_available_at, internal_date) WHERE analysis_status IN ('pending', 'processing', 'failed');
