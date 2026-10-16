CREATE UNIQUE INDEX CONCURRENTLY autopilot_subscriber_pkey ON public.autopilot_subscriber USING btree (autopilot_id, user_type, user_id);
