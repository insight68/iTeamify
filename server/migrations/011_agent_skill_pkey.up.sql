CREATE UNIQUE INDEX CONCURRENTLY agent_skill_pkey ON public.agent_skill USING btree (agent_id, skill_id);
