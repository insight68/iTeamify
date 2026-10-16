CREATE INDEX CONCURRENTLY user_gmail_connection_email_active_idx ON user_gmail_connection (lower(email_address)) WHERE status IN ('active', 'attention');
