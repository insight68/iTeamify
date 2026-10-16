CREATE UNIQUE INDEX CONCURRENTLY task_dispatch_outbox_event_uidx
    ON task_dispatch_outbox (event_key);
