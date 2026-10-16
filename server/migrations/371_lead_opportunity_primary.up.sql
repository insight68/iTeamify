CREATE UNIQUE INDEX CONCURRENTLY idx_lead_opportunity_primary
    ON lead_opportunity (workspace_id, lead_id)
    WHERE is_primary = true;
