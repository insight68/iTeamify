CREATE TABLE auth_challenge (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('login', 'signup', 'reset', 'set_password')),
    code_hash TEXT NOT NULL,
    proof_hash TEXT,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    proof_expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivery_failed BOOLEAN NOT NULL DEFAULT FALSE
);
