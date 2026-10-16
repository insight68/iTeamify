ALTER TABLE chat_session
    ALTER COLUMN agent_id DROP NOT NULL,
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'agent',
    ADD COLUMN peer_user_id UUID,
    ADD COLUMN last_sequence BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN creator_read_sequence BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN peer_read_sequence BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN direct_last_message_at TIMESTAMPTZ,
    ADD CONSTRAINT chat_session_participants_check CHECK (
        (kind = 'agent' AND agent_id IS NOT NULL AND peer_user_id IS NULL)
        OR (kind = 'direct' AND agent_id IS NULL AND peer_user_id IS NOT NULL
            AND peer_user_id <> creator_id AND runtime_id IS NULL AND project_id IS NULL
            AND session_id IS NULL AND work_dir IS NULL AND status = 'active' AND pinned_at IS NULL)
    ),
    ADD CONSTRAINT chat_session_read_sequences_check CHECK (
        last_sequence >= 0 AND creator_read_sequence BETWEEN 0 AND last_sequence
        AND peer_read_sequence BETWEEN 0 AND last_sequence
    );

ALTER TABLE chat_message
    ADD COLUMN sender_id UUID,
    ADD COLUMN client_message_id UUID,
    ADD COLUMN sequence BIGINT,
    ADD CONSTRAINT chat_message_direct_check CHECK (
        (sequence IS NULL AND ((sender_id IS NULL AND client_message_id IS NULL) OR (sender_id IS NOT NULL AND client_message_id IS NOT NULL AND role = 'user')))
        OR (sequence > 0 AND sender_id IS NOT NULL AND client_message_id IS NOT NULL
            AND role = 'user' AND task_id IS NULL AND length(btrim(content)) > 0 AND length(content) <= 20000)
    );
