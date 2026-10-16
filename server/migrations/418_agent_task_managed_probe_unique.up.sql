CREATE UNIQUE INDEX CONCURRENTLY agent_task_managed_probe_unique_idx ON agent_task_queue (provisioning_operation_id, agent_id) WHERE provisioning_operation_id IS NOT NULL;
