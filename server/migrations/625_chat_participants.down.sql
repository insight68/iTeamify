DELETE FROM chat_session WHERE kind = 'direct';
ALTER TABLE chat_message DROP CONSTRAINT chat_message_direct_check, DROP COLUMN sequence, DROP COLUMN client_message_id, DROP COLUMN sender_id;
ALTER TABLE chat_session DROP CONSTRAINT chat_session_participants_check, DROP CONSTRAINT chat_session_read_sequences_check, DROP COLUMN kind, DROP COLUMN peer_user_id, DROP COLUMN last_sequence, DROP COLUMN creator_read_sequence, DROP COLUMN peer_read_sequence, DROP COLUMN direct_last_message_at, ALTER COLUMN agent_id SET NOT NULL;
