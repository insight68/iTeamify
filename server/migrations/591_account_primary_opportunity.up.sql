CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_account_primary_opportunity ON lead_opportunity (workspace_id, account_id) WHERE account_id IS NOT NULL AND is_primary;
