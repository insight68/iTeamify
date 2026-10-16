CREATE UNIQUE INDEX CONCURRENTLY service_quote_public_action_uidx
    ON service_quote (source_task_id, action_key)
    WHERE conversation_type = 'public_expert';
