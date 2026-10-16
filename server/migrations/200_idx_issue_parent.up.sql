CREATE INDEX CONCURRENTLY idx_issue_parent ON public.issue USING btree (parent_issue_id);
