CREATE INDEX CONCURRENTLY idx_service_order_workspace_lead
    ON service_order (workspace_id, lead_id)
    WHERE lead_id IS NOT NULL;
