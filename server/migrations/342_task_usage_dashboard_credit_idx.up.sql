CREATE INDEX CONCURRENTLY task_usage_dashboard_credit_idx ON public.task_usage USING btree (created_at, task_id);
