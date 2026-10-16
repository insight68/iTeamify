CREATE UNIQUE INDEX CONCURRENTLY public_expert_release_page_version_uidx
    ON public_expert_page_release (page_id, version);
