BEGIN;
INSERT INTO chat_session (id, workspace_id, creator_id, peer_user_id, kind, title, last_sequence, creator_read_sequence, peer_read_sequence, direct_last_message_at, created_at, updated_at)
SELECT c.id, c.workspace_id, c.user_low_id, c.user_high_id, 'direct',
       COALESCE((SELECT left(m.content, 80) FROM direct_message m WHERE m.conversation_id = c.id ORDER BY m.sequence LIMIT 1), ''),
       c.last_sequence, c.low_read_sequence, c.high_read_sequence, c.last_message_at,
       COALESCE((SELECT min(m.created_at) FROM direct_message m WHERE m.conversation_id = c.id), now()), COALESCE(c.last_message_at, now())
FROM direct_conversation c;

INSERT INTO chat_message (id, chat_session_id, sender_id, client_message_id, sequence, role, content, created_at)
SELECT id, conversation_id, sender_id, client_message_id, sequence, 'user', content, created_at FROM direct_message;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM direct_conversation c LEFT JOIN chat_session s ON s.id = c.id
        WHERE s.id IS NULL OR s.workspace_id <> c.workspace_id OR s.kind <> 'direct'
          OR s.creator_id <> c.user_low_id OR s.peer_user_id <> c.user_high_id
          OR s.last_sequence <> c.last_sequence OR s.creator_read_sequence <> c.low_read_sequence
          OR s.peer_read_sequence <> c.high_read_sequence
          OR s.direct_last_message_at IS DISTINCT FROM c.last_message_at
          OR (SELECT count(*) FROM chat_message m WHERE m.chat_session_id = s.id) <> c.last_sequence
          OR (SELECT COALESCE(max(m.sequence), 0) FROM chat_message m WHERE m.chat_session_id = s.id) <> c.last_sequence
    ) OR EXISTS (
        SELECT 1 FROM direct_message d LEFT JOIN chat_message m ON m.id = d.id
        WHERE m.id IS NULL OR m.chat_session_id <> d.conversation_id OR m.sender_id <> d.sender_id
          OR m.client_message_id <> d.client_message_id OR m.sequence <> d.sequence
          OR m.content <> d.content OR m.created_at <> d.created_at
    ) THEN
        RAISE EXCEPTION 'direct chat migration invariant failed';
    END IF;
END $$;
COMMIT;
