CREATE INDEX CONCURRENTLY assistant_operation_task_time_idx ON public.assistant_operation USING btree (task_id, created_at DESC);
