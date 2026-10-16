CREATE INDEX CONCURRENTLY idx_service_quote_workspace_lead
    ON service_quote (workspace_id, lead_id)
    WHERE lead_id IS NOT NULL;
