CREATE INDEX CONCURRENTLY public_expert_task_running_lease_due_idx
    ON public_expert_task (lease_expires_at, created_at, id)
    WHERE status = 'running';
