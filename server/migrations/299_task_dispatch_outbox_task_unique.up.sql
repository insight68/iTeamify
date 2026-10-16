CREATE UNIQUE INDEX CONCURRENTLY task_dispatch_outbox_task_uidx
    ON task_dispatch_outbox (task_id);
