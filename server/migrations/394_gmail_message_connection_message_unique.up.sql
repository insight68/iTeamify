CREATE UNIQUE INDEX CONCURRENTLY gmail_message_connection_message_uidx ON gmail_message (connection_id, gmail_message_id);
