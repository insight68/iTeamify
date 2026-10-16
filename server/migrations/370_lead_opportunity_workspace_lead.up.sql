CREATE INDEX CONCURRENTLY idx_lead_opportunity_workspace_lead
    ON lead_opportunity (workspace_id, lead_id, updated_at DESC);
