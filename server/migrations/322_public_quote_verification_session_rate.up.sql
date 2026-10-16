CREATE INDEX CONCURRENTLY public_quote_verification_session_rate_idx
    ON public_quote_contact_verification (session_id, created_at DESC);
