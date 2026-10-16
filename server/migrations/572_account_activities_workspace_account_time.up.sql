CREATE INDEX CONCURRENTLY idx_account_activities_workspace_account_time
    ON account_activities (workspace_id, account_id, occurred_at DESC);
