CREATE TABLE user_password (
    user_id UUID NOT NULL,
    password_hash TEXT NOT NULL,
    auth_version BIGINT NOT NULL DEFAULT 1 CHECK (auth_version > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
