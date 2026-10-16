CREATE INDEX CONCURRENTLY idx_agent_task_queue_escalation_for ON public.agent_task_queue USING btree (escalation_for_task_id) WHERE (escalation_for_task_id IS NOT NULL);
