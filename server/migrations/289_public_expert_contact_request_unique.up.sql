CREATE UNIQUE INDEX CONCURRENTLY public_expert_contact_request_uidx
    ON public_expert_contact (session_id, request_id);
