CREATE INDEX CONCURRENTLY idx_account_opportunity ON lead_opportunity (workspace_id, account_id, updated_at DESC) WHERE account_id IS NOT NULL;
