CREATE INDEX CONCURRENTLY agent_task_queue_originator_user_id_idx ON public.agent_task_queue USING btree (originator_user_id) WHERE (originator_user_id IS NOT NULL);
