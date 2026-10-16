CREATE INDEX CONCURRENTLY idx_comment_issue_keyset ON public.comment USING btree (issue_id, created_at DESC, id DESC);
