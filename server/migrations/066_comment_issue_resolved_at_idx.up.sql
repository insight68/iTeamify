CREATE INDEX CONCURRENTLY comment_issue_resolved_at_idx ON public.comment USING btree (issue_id, resolved_at);
