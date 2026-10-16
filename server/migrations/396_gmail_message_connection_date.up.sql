CREATE INDEX CONCURRENTLY gmail_message_connection_date_idx ON gmail_message (connection_id, internal_date DESC);
