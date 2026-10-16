CREATE UNIQUE INDEX CONCURRENTLY issue_vcs_pull_request_pkey ON public.issue_vcs_pull_request USING btree (issue_id, pull_request_id);
