CREATE UNIQUE INDEX CONCURRENTLY direct_message_idempotency_idx ON direct_message (conversation_id, sender_id, client_message_id);
