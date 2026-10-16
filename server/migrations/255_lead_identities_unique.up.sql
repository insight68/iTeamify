CREATE UNIQUE INDEX CONCURRENTLY idx_lead_identities_workspace_type_value
    ON lead_identities (workspace_id, identity_type, normalized_value);
