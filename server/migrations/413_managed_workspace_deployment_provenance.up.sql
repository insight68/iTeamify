-- Managed releases remain platform-owned. Workspace rows only record the
-- immutable release that materialized them and the operation that performed
-- the write. Relationships are validated by the provisioning application
-- service; repository policy intentionally forbids database foreign keys.
ALTER TABLE agent_runtime
    ADD COLUMN offering_release_id UUID,
    ADD COLUMN managed_content_hash TEXT,
    ADD COLUMN provisioning_operation_id UUID,
    ADD COLUMN managed_at TIMESTAMPTZ,
    ADD CONSTRAINT agent_runtime_managed_content_hash_check
        CHECK (managed_content_hash IS NULL OR managed_content_hash ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE agent
    ADD COLUMN managed_release_id UUID,
    ADD COLUMN managed_content_hash TEXT,
    ADD COLUMN provisioning_operation_id UUID,
    ADD COLUMN managed_mcp_release_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    ADD COLUMN managed_at TIMESTAMPTZ,
    ADD CONSTRAINT agent_managed_content_hash_check
        CHECK (managed_content_hash IS NULL OR managed_content_hash ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE skill
    ADD COLUMN managed_release_id UUID,
    ADD COLUMN managed_content_hash TEXT,
    ADD COLUMN provisioning_operation_id UUID,
    ADD COLUMN managed_at TIMESTAMPTZ,
    ADD CONSTRAINT skill_managed_content_hash_check
        CHECK (managed_content_hash IS NULL OR managed_content_hash ~ '^[0-9a-f]{64}$') NOT VALID;

-- A fresh token is generated for every claim. It fences an expired worker even
-- if the same process-level lease owner later claims the operation again.
ALTER TABLE workspace_provisioning_operation
    ADD COLUMN lease_token UUID;

-- Synthetic readiness tasks use the normal task execution path so they prove
-- model + task-token + MCP behavior. The provenance columns make the enqueue
-- idempotent without coupling the queue to provisioning through a foreign key.
ALTER TABLE agent_task_queue
    ADD COLUMN provisioning_operation_id UUID,
    ADD COLUMN managed_probe_nonce TEXT,
    ADD CONSTRAINT agent_task_queue_managed_probe_shape_check CHECK (
        (provisioning_operation_id IS NULL AND managed_probe_nonce IS NULL)
        OR (
            provisioning_operation_id IS NOT NULL
            AND managed_probe_nonce IS NOT NULL
            AND char_length(managed_probe_nonce) BETWEEN 16 AND 128
        )
    ) NOT VALID;
