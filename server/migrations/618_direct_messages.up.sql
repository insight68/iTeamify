CREATE TABLE direct_conversation (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_low_id UUID NOT NULL,
    user_high_id UUID NOT NULL,
    last_sequence BIGINT NOT NULL DEFAULT 0,
    low_read_sequence BIGINT NOT NULL DEFAULT 0,
    high_read_sequence BIGINT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    CHECK (user_low_id < user_high_id),
    CHECK (low_read_sequence >= 0 AND low_read_sequence <= last_sequence),
    CHECK (high_read_sequence >= 0 AND high_read_sequence <= last_sequence)
);

CREATE TABLE direct_message (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    client_message_id UUID NOT NULL,
    sequence BIGINT NOT NULL CHECK (sequence > 0),
    content TEXT NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 20000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
