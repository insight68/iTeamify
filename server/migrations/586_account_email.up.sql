CREATE INDEX CONCURRENTLY idx_account_email ON outbound_email (workspace_id, user_id, account_id, created_at DESC) WHERE account_id IS NOT NULL;
