CREATE INDEX CONCURRENTLY idx_issue_vcs_pull_request_pr ON public.issue_vcs_pull_request USING btree (pull_request_id);
