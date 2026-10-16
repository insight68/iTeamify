CREATE UNIQUE INDEX CONCURRENTLY public_expert_task_source_message_uidx
    ON public_expert_task (session_id, source_message_id)
    WHERE source_message_id IS NOT NULL;
