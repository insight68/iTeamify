CREATE INDEX CONCURRENTLY idx_service_quote_opportunity
    ON service_quote (workspace_id, opportunity_id, created_at DESC)
    WHERE opportunity_id IS NOT NULL;
