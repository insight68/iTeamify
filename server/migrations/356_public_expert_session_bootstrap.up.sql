ALTER TABLE public_expert_session
    ADD COLUMN initial_client_message_id TEXT,
    ADD COLUMN bootstrap_token_hash BYTEA,
    ADD COLUMN bootstrap_payload_hash BYTEA,
    ADD COLUMN bootstrap_expires_at TIMESTAMPTZ,
    ADD CONSTRAINT public_expert_session_bootstrap_consistency CHECK (
        (
            initial_client_message_id IS NULL
            AND bootstrap_token_hash IS NULL
            AND bootstrap_payload_hash IS NULL
            AND bootstrap_expires_at IS NULL
        )
        OR (
            length(initial_client_message_id) BETWEEN 1 AND 200
            AND octet_length(bootstrap_token_hash) = 32
            AND octet_length(bootstrap_payload_hash) = 32
            AND bootstrap_expires_at > created_at
            AND bootstrap_expires_at <= expires_at
        )
    );
