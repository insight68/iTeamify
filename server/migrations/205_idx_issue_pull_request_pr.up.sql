CREATE INDEX CONCURRENTLY idx_issue_pull_request_pr ON public.issue_pull_request USING btree (pull_request_id);
