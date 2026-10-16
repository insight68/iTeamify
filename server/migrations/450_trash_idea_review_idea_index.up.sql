CREATE INDEX CONCURRENTLY trash_idea_review_idea_idx ON trash_idea_review (workspace_id, idea_id, created_at DESC);
