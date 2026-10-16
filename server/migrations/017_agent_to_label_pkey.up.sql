CREATE UNIQUE INDEX CONCURRENTLY agent_to_label_pkey ON public.agent_to_label USING btree (agent_id, label_id);
