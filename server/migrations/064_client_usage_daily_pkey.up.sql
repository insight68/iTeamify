CREATE UNIQUE INDEX CONCURRENTLY client_usage_daily_pkey ON public.client_usage_daily USING btree (user_id, client_type, install_id, activity_date);
