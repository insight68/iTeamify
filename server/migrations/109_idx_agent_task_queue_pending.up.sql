CREATE INDEX CONCURRENTLY idx_agent_task_queue_pending ON public.agent_task_queue USING btree (agent_id, priority DESC, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'dispatched'::text]));
