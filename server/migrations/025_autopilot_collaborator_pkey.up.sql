CREATE UNIQUE INDEX CONCURRENTLY autopilot_collaborator_pkey ON public.autopilot_collaborator USING btree (autopilot_id, user_type, user_id);
