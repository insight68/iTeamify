CREATE INDEX CONCURRENTLY public_expert_task_queue_idx
    ON public_expert_task (status, created_at, id)
    WHERE status IN ('queued', 'dispatched', 'running');
