CREATE UNIQUE INDEX CONCURRENTLY public_quote_verification_request_uidx
    ON public_quote_contact_verification (session_id, quote_id, request_id);
