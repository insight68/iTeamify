CREATE UNIQUE INDEX CONCURRENTLY channel_inbound_message_dedup_pkey ON public.channel_inbound_message_dedup USING btree (installation_id, message_id);
