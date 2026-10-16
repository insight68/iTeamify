CREATE UNIQUE INDEX CONCURRENTLY service_quote_public_revision_uidx
    ON service_quote (public_expert_session_id, revision)
    WHERE conversation_type = 'public_expert';
