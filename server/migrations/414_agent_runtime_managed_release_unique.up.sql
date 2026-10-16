CREATE UNIQUE INDEX CONCURRENTLY agent_runtime_managed_release_uidx ON agent_runtime (workspace_id, offering_release_id, provider) WHERE offering_release_id IS NOT NULL;
