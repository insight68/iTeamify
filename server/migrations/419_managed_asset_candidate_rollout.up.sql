-- Cross-workspace reuse is a reviewed publication workflow, not a direct copy
-- of mutable workspace rows. Candidate snapshots are immutable; lifecycle
-- fields record author authorization, automated scanning, curator review and
-- withdrawal. Relationships are enforced in the application layer.
CREATE TABLE managed_asset_candidate (
    id                     UUID NOT NULL DEFAULT gen_random_uuid(),
    asset_type             TEXT NOT NULL CHECK (asset_type IN (
        'agent_blueprint',
        'skill_package',
        'mcp_profile'
    )),
    source_workspace_id    UUID NOT NULL,
    source_entity_id       UUID NOT NULL,
    source_updated_at      TIMESTAMPTZ NOT NULL,
    source_content_hash    TEXT NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
    submitted_by           UUID NOT NULL,
    authorization_version  TEXT NOT NULL CHECK (char_length(authorization_version) BETWEEN 1 AND 80),
    authorized_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_license         TEXT NOT NULL CHECK (char_length(source_license) BETWEEN 1 AND 160),
    status                 TEXT NOT NULL CHECK (status IN (
        'nominated',
        'needs_changes',
        'approved',
        'rejected',
        'suspended',
        'withdrawn_for_new_use'
    )),
    scan_status            TEXT NOT NULL CHECK (scan_status IN ('passed', 'failed')),
    scan_findings          JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(scan_findings) = 'array'),
    source_snapshot        JSONB NOT NULL
        CHECK (jsonb_typeof(source_snapshot) = 'object'),
    dependency_snapshot    JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(dependency_snapshot) = 'array'),
    reviewed_by            UUID,
    review_reason          TEXT,
    reviewed_at            TIMESTAMPTZ,
    published_release_id   UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (status = 'nominated' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR
        (status = 'needs_changes' AND (
            (reviewed_by IS NULL AND reviewed_at IS NULL)
            OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
        ))
        OR
        (status IN ('approved', 'rejected', 'suspended', 'withdrawn_for_new_use')
            AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

-- A rollout coordinates batches of the existing durable workspace
-- provisioning operations. It never materializes assets itself.
CREATE TABLE managed_assembly_rollout (
    id                       UUID NOT NULL DEFAULT gen_random_uuid(),
    assembly_release_id      UUID NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'running',
        'paused',
        'completed',
        'failed',
        'rolling_back',
        'rolled_back',
        'cancelled'
    )),
    canary_size              INTEGER NOT NULL DEFAULT 1 CHECK (canary_size BETWEEN 1 AND 1000),
    batch_size               INTEGER NOT NULL DEFAULT 10 CHECK (batch_size BETWEEN 1 AND 10000),
    failure_threshold_percent INTEGER NOT NULL DEFAULT 20
        CHECK (failure_threshold_percent BETWEEN 1 AND 100),
    created_by               UUID NOT NULL,
    started_at               TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE managed_assembly_rollout_target (
    id                           UUID NOT NULL DEFAULT gen_random_uuid(),
    rollout_id                   UUID NOT NULL,
    workspace_id                 UUID NOT NULL,
    previous_assembly_release_id UUID,
    expected_current_operation_id UUID,
    operation_id                 UUID,
    rollback_operation_id        UUID,
    sequence_no                  INTEGER NOT NULL CHECK (sequence_no >= 0),
    status                       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'queued',
        'running',
        'ready',
        'skipped',
        'failed',
        'conflict',
        'rollback_queued',
        'rolling_back',
        'rollback_failed',
        'rolled_back'
    )),
    last_error_code              TEXT,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only operator evidence. No update/delete query is provided.
CREATE TABLE managed_provisioning_audit_event (
    id             UUID NOT NULL DEFAULT gen_random_uuid(),
    actor_id       UUID NOT NULL,
    action         TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
    resource_type  TEXT NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 80),
    resource_id    UUID NOT NULL,
    details        JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The active deployment pointer is the rollout compare-and-swap baseline.
-- Historical operations remain immutable evidence; this row changes only in
-- the same transaction that activates a fully validated staged graph.
CREATE TABLE workspace_managed_deployment (
    workspace_id              UUID NOT NULL,
    assembly_release_id       UUID NOT NULL,
    provisioning_operation_id UUID NOT NULL,
    activated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE managed_asset_release
    ADD COLUMN candidate_id UUID,
    ADD COLUMN distribution_status TEXT NOT NULL DEFAULT 'active'
        CHECK (distribution_status IN ('active', 'suspended', 'withdrawn_for_new_use')),
    ADD COLUMN distribution_updated_by UUID,
    ADD COLUMN distribution_updated_at TIMESTAMPTZ;

ALTER TABLE workspace_provisioning_operation
    ADD COLUMN trigger TEXT NOT NULL DEFAULT 'workspace_created'
        CHECK (trigger IN ('workspace_created', 'rollout', 'rollback')),
    ADD COLUMN rollout_target_id UUID,
    ADD COLUMN previous_assembly_release_id UUID,
    ADD COLUMN expected_current_operation_id UUID;

ALTER TABLE agent_runtime
    ADD COLUMN managed_state TEXT;

ALTER TABLE agent
    ADD COLUMN managed_state TEXT;

ALTER TABLE skill
    ADD COLUMN managed_state TEXT;

ALTER TABLE agent_runtime
    ADD CONSTRAINT agent_runtime_managed_state_value_check
        CHECK (managed_state IS NULL OR managed_state IN ('staged', 'active', 'retired')) NOT VALID;

ALTER TABLE agent
    ADD CONSTRAINT agent_managed_state_value_check
        CHECK (managed_state IS NULL OR managed_state IN ('staged', 'active', 'retired')) NOT VALID;

ALTER TABLE skill
    ADD CONSTRAINT skill_managed_state_value_check
        CHECK (managed_state IS NULL OR managed_state IN ('staged', 'active', 'retired')) NOT VALID;

ALTER TABLE agent_runtime
    ADD CONSTRAINT agent_runtime_managed_state_check CHECK (
        (offering_release_id IS NULL AND managed_state IS NULL)
        OR (offering_release_id IS NOT NULL AND managed_state IS NOT NULL)
    ) NOT VALID;

ALTER TABLE agent
    ADD CONSTRAINT agent_managed_state_check CHECK (
        (managed_release_id IS NULL AND managed_state IS NULL)
        OR (managed_release_id IS NOT NULL AND managed_state IS NOT NULL)
    ) NOT VALID;

ALTER TABLE skill
    ADD CONSTRAINT skill_managed_state_check CHECK (
        (managed_release_id IS NULL AND managed_state IS NULL)
        OR (managed_release_id IS NOT NULL AND managed_state IS NOT NULL)
    ) NOT VALID;

UPDATE agent_runtime SET managed_state = 'active' WHERE offering_release_id IS NOT NULL AND managed_state IS NULL;
UPDATE agent SET managed_state = 'active' WHERE managed_release_id IS NOT NULL AND managed_state IS NULL;
UPDATE skill SET managed_state = 'active' WHERE managed_release_id IS NOT NULL AND managed_state IS NULL;

INSERT INTO workspace_managed_deployment (
    workspace_id,
    assembly_release_id,
    provisioning_operation_id,
    activated_at,
    updated_at
)
SELECT DISTINCT ON (workspace_id)
       workspace_id,
       assembly_release_id,
       id,
       COALESCE(completed_at, updated_at, now()),
       now()
FROM workspace_provisioning_operation
WHERE status = 'ready'
ORDER BY workspace_id, completed_at DESC NULLS LAST, created_at DESC, id DESC;

ALTER TABLE agent_runtime VALIDATE CONSTRAINT agent_runtime_managed_state_value_check;
ALTER TABLE agent VALIDATE CONSTRAINT agent_managed_state_value_check;
ALTER TABLE skill VALIDATE CONSTRAINT skill_managed_state_value_check;
ALTER TABLE agent_runtime VALIDATE CONSTRAINT agent_runtime_managed_state_check;
ALTER TABLE agent VALIDATE CONSTRAINT agent_managed_state_check;
ALTER TABLE skill VALIDATE CONSTRAINT skill_managed_state_check;
