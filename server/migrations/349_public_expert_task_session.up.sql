CREATE INDEX CONCURRENTLY public_expert_task_session_idx
    ON public_expert_task (session_id, id);
