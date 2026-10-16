CREATE INDEX CONCURRENTLY idx_accounts_workspace_updated
    ON accounts (workspace_id, updated_at DESC, id DESC)
    WHERE record_status = 'active';
