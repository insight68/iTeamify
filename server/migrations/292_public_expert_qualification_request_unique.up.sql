CREATE UNIQUE INDEX CONCURRENTLY public_expert_qualification_request_uidx
    ON public_expert_qualification (session_id, request_id);
