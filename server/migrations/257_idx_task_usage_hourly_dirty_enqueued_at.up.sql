CREATE INDEX CONCURRENTLY idx_task_usage_hourly_dirty_enqueued_at ON public.task_usage_hourly_dirty USING btree (enqueued_at);
