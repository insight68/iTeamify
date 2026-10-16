ALTER TABLE workspace_provisioning_operation
    DROP COLUMN IF EXISTS lease_token;

ALTER TABLE agent_task_queue
    DROP CONSTRAINT IF EXISTS agent_task_queue_managed_probe_shape_check,
    DROP COLUMN IF EXISTS managed_probe_nonce,
    DROP COLUMN IF EXISTS provisioning_operation_id;

ALTER TABLE skill
    DROP CONSTRAINT IF EXISTS skill_managed_content_hash_check,
    DROP COLUMN IF EXISTS managed_at,
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_content_hash,
    DROP COLUMN IF EXISTS managed_release_id;

ALTER TABLE agent
    DROP CONSTRAINT IF EXISTS agent_managed_content_hash_check,
    DROP COLUMN IF EXISTS managed_at,
    DROP COLUMN IF EXISTS managed_mcp_release_ids,
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_content_hash,
    DROP COLUMN IF EXISTS managed_release_id;

ALTER TABLE agent_runtime
    DROP CONSTRAINT IF EXISTS agent_runtime_managed_content_hash_check,
    DROP COLUMN IF EXISTS managed_at,
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_content_hash,
    DROP COLUMN IF EXISTS offering_release_id;
