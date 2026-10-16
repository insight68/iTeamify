CREATE INDEX CONCURRENTLY idx_agent_task_queue_claim_candidates ON public.agent_task_queue USING btree (runtime_id, priority DESC, created_at) WHERE (status = 'queued'::text);
