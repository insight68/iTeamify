CREATE INDEX CONCURRENTLY idx_agent_task_queue_deferred_fire ON public.agent_task_queue USING btree (runtime_id, fire_at) WHERE (status = 'deferred'::text);
