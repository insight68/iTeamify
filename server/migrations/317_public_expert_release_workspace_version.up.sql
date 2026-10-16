CREATE INDEX CONCURRENTLY public_expert_release_workspace_version_idx
    ON public_expert_page_release (workspace_id, version DESC);
