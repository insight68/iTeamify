CREATE INDEX CONCURRENTLY reddit_reply_draft_queue_idx ON reddit_reply_draft (available_at) WHERE status='queued';
