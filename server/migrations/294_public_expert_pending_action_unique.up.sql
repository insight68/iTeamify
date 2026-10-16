CREATE UNIQUE INDEX CONCURRENTLY public_expert_pending_action_source_uidx
    ON public_expert_pending_action (source_task_id, source_action_ordinal);
