BEGIN;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM direct_conversation c LEFT JOIN chat_session s ON s.id = c.id
        WHERE s.id IS NULL OR s.workspace_id <> c.workspace_id OR s.kind <> 'direct'
          OR s.creator_id <> c.user_low_id OR s.peer_user_id <> c.user_high_id
          OR s.last_sequence < c.last_sequence OR s.creator_read_sequence < c.low_read_sequence
          OR s.peer_read_sequence < c.high_read_sequence
    ) OR EXISTS (
        SELECT 1 FROM direct_message d LEFT JOIN chat_message m ON m.id = d.id
        LEFT JOIN chat_session s ON s.id = m.chat_session_id
        WHERE m.id IS NULL OR m.chat_session_id <> d.conversation_id OR s.workspace_id <> d.workspace_id
          OR m.sender_id <> d.sender_id OR m.client_message_id <> d.client_message_id
          OR m.sequence <> d.sequence OR m.content <> d.content OR m.created_at <> d.created_at
    ) THEN
        RAISE EXCEPTION 'cannot remove direct tables: history verification failed';
    END IF;
END $$;
DROP TABLE direct_message;
DROP TABLE direct_conversation;
COMMIT;
