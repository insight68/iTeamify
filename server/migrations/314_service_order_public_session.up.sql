CREATE INDEX CONCURRENTLY service_order_public_session_idx
    ON service_order (workspace_id, public_expert_session_id, created_at DESC)
    WHERE public_expert_session_id IS NOT NULL;
