-- Platform-managed releases are intentionally separate from workspace-owned
-- agent/runtime/skill rows. A release is a bounded, immutable publication
-- envelope; type-specific manifest validation lives in the provisioning
-- application service instead of an unbounded EAV schema.
CREATE TABLE managed_asset_release (
    id                  UUID NOT NULL DEFAULT gen_random_uuid(),
    asset_key           TEXT NOT NULL CHECK (asset_key ~ '^[a-z0-9][a-z0-9._-]{1,126}$'),
    asset_type          TEXT NOT NULL CHECK (asset_type IN (
        'runtime_offering',
        'agent_blueprint',
        'skill_package',
        'mcp_profile',
        'workspace_assembly'
    )),
    version             INTEGER NOT NULL CHECK (version > 0),
    status              TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    manifest            JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(manifest) = 'object'),
    compatibility       JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(compatibility) = 'object'),
    content_hash        TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    source_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(source_snapshot) = 'object'),
    source_license      TEXT,
    source_workspace_id UUID,
    source_entity_id    UUID,
    created_by          UUID NOT NULL,
    published_by        UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at        TIMESTAMPTZ,
    archived_at         TIMESTAMPTZ,
    CHECK (
        (status = 'draft' AND published_by IS NULL AND published_at IS NULL)
        OR
        (status IN ('published', 'archived') AND published_by IS NOT NULL AND published_at IS NOT NULL)
    )
);

-- V1 deliberately has one global policy. Region/plan/experiment rules belong
-- in a later policy table, not in the workspace creation hot path.
CREATE TABLE new_workspace_provisioning_policy (
    policy_key          TEXT NOT NULL CHECK (policy_key = 'default'),
    assembly_release_id UUID NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    updated_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- This row is the durable truth for asynchronous workspace assembly. It pins
-- the release selected inside the workspace creation transaction and carries
-- only bounded checkpoints/error codes; credentials never belong here.
CREATE TABLE workspace_provisioning_operation (
    id                  UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL,
    assembly_release_id UUID NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'preparing_runtime',
        'installing_assets',
        'validating',
        'ready',
        'degraded',
        'failed'
    )),
    attempt_count       INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts        INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_owner         TEXT,
    lease_expires_at    TIMESTAMPTZ,
    checkpoint          JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(checkpoint) = 'object'),
    error_code          TEXT,
    error_component     TEXT,
    last_error_at       TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (status IN ('ready', 'degraded', 'failed') AND completed_at IS NOT NULL)
        OR
        (status NOT IN ('ready', 'degraded', 'failed') AND completed_at IS NULL)
    )
);
