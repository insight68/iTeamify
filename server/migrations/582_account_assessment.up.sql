CREATE INDEX CONCURRENTLY idx_account_assessment ON lead_assessment (workspace_id, account_id, assessed_at DESC, id DESC) WHERE account_id IS NOT NULL;
