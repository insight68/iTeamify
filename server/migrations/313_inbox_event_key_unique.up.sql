CREATE UNIQUE INDEX CONCURRENTLY inbox_item_event_key_uidx
    ON inbox_item (event_key)
    WHERE event_key IS NOT NULL;
