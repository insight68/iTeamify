CREATE UNIQUE INDEX CONCURRENTLY inbox_item_event_key_uidx ON public.inbox_item USING btree (event_key) WHERE (event_key IS NOT NULL);
