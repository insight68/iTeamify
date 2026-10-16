CREATE INDEX CONCURRENTLY public_quote_verification_quote_status_idx
    ON public_quote_contact_verification (quote_id, status, created_at DESC);
