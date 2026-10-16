CREATE INDEX CONCURRENTLY idx_account_order ON service_order (workspace_id, account_id, created_at DESC) WHERE account_id IS NOT NULL;
