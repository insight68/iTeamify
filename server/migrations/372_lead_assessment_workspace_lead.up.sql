CREATE INDEX CONCURRENTLY idx_lead_assessment_workspace_lead
    ON lead_assessment (workspace_id, lead_id, assessed_at DESC, id DESC);
