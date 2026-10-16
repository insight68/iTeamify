CREATE UNIQUE INDEX CONCURRENTLY idx_service_engagement_order_unique
    ON service_engagement (workspace_id, order_id)
    WHERE order_id IS NOT NULL;
