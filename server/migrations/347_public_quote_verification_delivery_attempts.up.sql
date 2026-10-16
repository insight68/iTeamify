ALTER TABLE public_quote_contact_verification
    ADD COLUMN delivery_attempt_count INTEGER NOT NULL DEFAULT 1
        CHECK (delivery_attempt_count BETWEEN 1 AND 20),
    ADD COLUMN max_delivery_attempts INTEGER NOT NULL DEFAULT 3
        CHECK (max_delivery_attempts BETWEEN 1 AND 20),
    ADD COLUMN last_delivery_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD CONSTRAINT public_quote_verification_delivery_attempts_valid
        CHECK (delivery_attempt_count <= max_delivery_attempts);
