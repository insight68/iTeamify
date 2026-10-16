CREATE INDEX CONCURRENTLY service_order_public_session_lookup_idx
    ON service_order (public_expert_session_id)
    WHERE public_expert_session_id IS NOT NULL;
