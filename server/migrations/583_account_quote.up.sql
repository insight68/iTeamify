CREATE INDEX CONCURRENTLY idx_account_quote ON service_quote (workspace_id, account_id, created_at DESC) WHERE account_id IS NOT NULL;
