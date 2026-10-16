CREATE INDEX CONCURRENTLY agent_runtime_managed_daemon_assignment_idx ON agent_runtime (daemon_id, workspace_id, provider) WHERE offering_release_id IS NOT NULL;
