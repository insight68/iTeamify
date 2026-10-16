CREATE UNIQUE INDEX CONCURRENTLY chat_context_resource_session_resource_uidx
    ON chat_context_resource (chat_session_id, resource_type, resource_id);
