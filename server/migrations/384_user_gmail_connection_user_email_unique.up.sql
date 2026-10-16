CREATE UNIQUE INDEX CONCURRENTLY user_gmail_connection_user_email_uidx ON user_gmail_connection (user_id, lower(email_address));
