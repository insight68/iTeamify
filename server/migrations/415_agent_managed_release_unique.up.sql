CREATE UNIQUE INDEX CONCURRENTLY agent_managed_release_uidx ON agent (workspace_id, managed_release_id) WHERE managed_release_id IS NOT NULL;
