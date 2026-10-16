CREATE UNIQUE INDEX CONCURRENTLY delivery_outbox_event_uidx
    ON delivery_outbox (event_key);
