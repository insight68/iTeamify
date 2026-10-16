CREATE UNIQUE INDEX CONCURRENTLY idx_channel_outbound_card_task ON public.channel_outbound_card_message USING btree (task_id) WHERE (task_id IS NOT NULL);
