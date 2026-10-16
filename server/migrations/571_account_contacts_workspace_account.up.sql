CREATE INDEX CONCURRENTLY idx_account_contacts_workspace_account
    ON account_contacts (workspace_id, account_id);
