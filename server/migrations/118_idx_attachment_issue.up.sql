CREATE INDEX CONCURRENTLY idx_attachment_issue ON public.attachment USING btree (issue_id) WHERE (issue_id IS NOT NULL);
