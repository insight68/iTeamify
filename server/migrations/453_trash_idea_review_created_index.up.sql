CREATE INDEX CONCURRENTLY trash_idea_review_created_idx ON trash_idea_review (workspace_id, created_at DESC, id DESC);
