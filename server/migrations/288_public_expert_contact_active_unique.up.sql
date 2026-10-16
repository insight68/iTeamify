CREATE UNIQUE INDEX CONCURRENTLY public_expert_contact_active_uidx
    ON public_expert_contact (session_id)
    WHERE status = 'active';
