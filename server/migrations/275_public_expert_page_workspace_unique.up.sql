CREATE UNIQUE INDEX CONCURRENTLY public_expert_page_workspace_uidx
    ON public_expert_page (workspace_id)
    WHERE status <> 'archived';
