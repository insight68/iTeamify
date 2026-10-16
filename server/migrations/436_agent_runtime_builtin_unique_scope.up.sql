CREATE UNIQUE INDEX CONCURRENTLY agent_runtime_workspace_daemon_provider_unmanaged_key ON agent_runtime (workspace_id, daemon_id, provider) WHERE profile_id IS NULL AND offering_release_id IS NULL;
