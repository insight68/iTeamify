CREATE UNIQUE INDEX CONCURRENTLY skill_to_label_pkey ON public.skill_to_label USING btree (skill_id, label_id);
