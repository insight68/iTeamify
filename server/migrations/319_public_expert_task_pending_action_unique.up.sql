CREATE UNIQUE INDEX CONCURRENTLY public_expert_task_pending_action_uidx
    ON public_expert_task (pending_action_id)
    WHERE pending_action_id IS NOT NULL;
