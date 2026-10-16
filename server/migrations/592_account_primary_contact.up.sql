CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_account_primary_contact ON account_contacts (workspace_id, account_id) WHERE is_primary;
