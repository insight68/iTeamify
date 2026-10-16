CREATE INDEX CONCURRENTLY agent_task_queue_squad_id_idx ON public.agent_task_queue USING btree (squad_id) WHERE (squad_id IS NOT NULL);
