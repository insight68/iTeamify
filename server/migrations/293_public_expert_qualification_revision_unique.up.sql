CREATE UNIQUE INDEX CONCURRENTLY public_expert_qualification_revision_uidx
    ON public_expert_qualification (session_id, revision);
