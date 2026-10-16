CREATE INDEX CONCURRENTLY trash_idea_feed_idx ON trash_idea (workspace_id, status, content_locale, needs_review, published_at DESC);
