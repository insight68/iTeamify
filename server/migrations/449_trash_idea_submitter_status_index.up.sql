CREATE INDEX CONCURRENTLY trash_idea_submitter_status_idx ON trash_idea (workspace_id, submitter_visitor_id, status, created_at DESC);
