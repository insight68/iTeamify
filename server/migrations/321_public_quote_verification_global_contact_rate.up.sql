CREATE INDEX CONCURRENTLY public_quote_verification_global_contact_rate_idx
    ON public_quote_contact_verification (channel, contact_value_hash, created_at DESC);
