CREATE INDEX CONCURRENTLY gmail_message_body_cleanup_idx ON gmail_message (created_at) WHERE body_text <> '';
