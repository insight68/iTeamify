CREATE UNIQUE INDEX CONCURRENTLY public_expert_contact_revision_uidx
    ON public_expert_contact (session_id, revision);
