CREATE INDEX CONCURRENTLY idx_issue_assignee ON public.issue USING btree (assignee_type, assignee_id);
