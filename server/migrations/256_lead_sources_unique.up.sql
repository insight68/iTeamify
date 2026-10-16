CREATE UNIQUE INDEX CONCURRENTLY idx_lead_sources_workspace_type_key
    ON lead_sources (workspace_id, source_type, source_key);
