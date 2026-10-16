CREATE UNIQUE INDEX CONCURRENTLY public_expert_task_active_session_uidx
    ON public_expert_task (session_id)
    WHERE status IN ('queued', 'dispatched', 'running');
