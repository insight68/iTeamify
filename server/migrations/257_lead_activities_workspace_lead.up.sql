CREATE INDEX CONCURRENTLY idx_lead_activities_workspace_lead_time
    ON lead_activities (workspace_id, lead_id, occurred_at DESC);
