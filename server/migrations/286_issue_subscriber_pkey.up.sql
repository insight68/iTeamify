CREATE UNIQUE INDEX CONCURRENTLY issue_subscriber_pkey ON public.issue_subscriber USING btree (issue_id, user_type, user_id);
