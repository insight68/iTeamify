CREATE UNIQUE INDEX CONCURRENTLY idx_account_identities_workspace_type_value
    ON account_identities (workspace_id, identity_type, normalized_value);
