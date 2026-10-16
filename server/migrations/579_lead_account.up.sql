CREATE INDEX CONCURRENTLY idx_lead_account ON leads (workspace_id, account_id) WHERE account_id IS NOT NULL;
