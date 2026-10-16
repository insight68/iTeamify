CREATE UNIQUE INDEX CONCURRENTLY service_quote_public_active_uidx
    ON service_quote (public_expert_session_id)
    WHERE conversation_type = 'public_expert' AND status = 'active';
