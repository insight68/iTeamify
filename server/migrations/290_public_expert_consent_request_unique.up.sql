CREATE UNIQUE INDEX CONCURRENTLY public_expert_consent_request_uidx
    ON public_expert_consent_record (session_id, request_id);
