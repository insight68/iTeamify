CREATE INDEX CONCURRENTLY idx_service_engagement_workspace_lead
    ON service_engagement (workspace_id, lead_id, updated_at DESC);
