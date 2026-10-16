CREATE UNIQUE INDEX CONCURRENTLY public_quote_acceptance_evidence_request_uidx
    ON public_quote_acceptance_evidence (session_id, request_id);
