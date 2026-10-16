CREATE UNIQUE INDEX CONCURRENTLY public_expert_reservation_task_uidx
    ON public_expert_usage_reservation (task_id);
