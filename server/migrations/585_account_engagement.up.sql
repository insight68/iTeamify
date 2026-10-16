CREATE INDEX CONCURRENTLY idx_account_engagement ON service_engagement (workspace_id, account_id, updated_at DESC) WHERE account_id IS NOT NULL;
