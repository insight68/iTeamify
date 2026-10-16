CREATE INDEX CONCURRENTLY idx_issue_reaction_issue_id ON public.issue_reaction USING btree (issue_id);
