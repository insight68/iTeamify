CREATE INDEX CONCURRENTLY idx_accounts_workspace_parked
    ON accounts (workspace_id, updated_at DESC)
    WHERE record_status = 'active' AND parked_at IS NOT NULL;
