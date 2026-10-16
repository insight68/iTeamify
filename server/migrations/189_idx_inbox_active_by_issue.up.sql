CREATE INDEX CONCURRENTLY idx_inbox_active_by_issue ON public.inbox_item USING btree (workspace_id, recipient_type, recipient_id, issue_id) WHERE (archived = false);
