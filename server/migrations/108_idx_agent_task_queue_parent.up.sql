CREATE INDEX CONCURRENTLY idx_agent_task_queue_parent ON public.agent_task_queue USING btree (parent_task_id);
