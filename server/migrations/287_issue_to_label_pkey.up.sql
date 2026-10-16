CREATE UNIQUE INDEX CONCURRENTLY issue_to_label_pkey ON public.issue_to_label USING btree (issue_id, label_id);
