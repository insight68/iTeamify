CREATE INDEX CONCURRENTLY idx_task_usage_hourly_runtime_time ON public.task_usage_hourly USING btree (runtime_id, bucket_hour DESC);
