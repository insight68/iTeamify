CREATE INDEX CONCURRENTLY idx_service_order_opportunity
    ON service_order (workspace_id, opportunity_id, created_at DESC)
    WHERE opportunity_id IS NOT NULL;
