-- Blueprint provenance and execution policy are separate concerns. Origin
-- rows preserve the stable workspace entity IDs and merge baselines; the
-- execution policy stays on the Agent hot path so task claims need no join.
ALTER TABLE agent
    ADD COLUMN execution_policy_key TEXT NOT NULL DEFAULT 'general' CHECK (
        execution_policy_key IN (
            'general',
            'managed_chat_v1',
            'workspace_managed_claude_v1',
            'workspace_openagent_v1'
        )
    );

UPDATE agent
SET execution_policy_key = 'managed_chat_v1'
WHERE managed_release_id IS NOT NULL;

CREATE TABLE agent_blueprint_origin (
    workspace_id          UUID NOT NULL,
    agent_id              UUID NOT NULL,
    blueprint_asset_key   TEXT NOT NULL CHECK (
        blueprint_asset_key ~ '^[a-z0-9][a-z0-9._-]{1,126}$'
    ),
    initialized_release_id UUID NOT NULL,
    baseline_snapshot     JSONB NOT NULL CHECK (
        jsonb_typeof(baseline_snapshot) = 'object'
    ),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skill_blueprint_origin (
    workspace_id          UUID NOT NULL,
    skill_id              UUID NOT NULL,
    blueprint_asset_key   TEXT NOT NULL CHECK (
        blueprint_asset_key ~ '^[a-z0-9][a-z0-9._-]{1,126}$'
    ),
    initialized_release_id UUID NOT NULL,
    baseline_snapshot     JSONB NOT NULL CHECK (
        jsonb_typeof(baseline_snapshot) = 'object'
    ),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_blueprint_suggestion (
    workspace_id       UUID NOT NULL,
    agent_id           UUID NOT NULL,
    target_release_id  UUID NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'applied', 'dismissed')
    ),
    scope_fingerprint  TEXT NOT NULL CHECK (
        scope_fingerprint ~ '^[0-9a-f]{64}$'
    ),
    selected_fields    TEXT[] NOT NULL DEFAULT '{}'::text[],
    decided_by         UUID,
    decided_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
        OR
        (status IN ('applied', 'dismissed') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    )
);

-- Existing active initialized rows keep their IDs and current workspace
-- content. The immutable release manifests become the original merge base.
INSERT INTO agent_blueprint_origin (
    workspace_id,
    agent_id,
    blueprint_asset_key,
    initialized_release_id,
    baseline_snapshot
)
SELECT a.workspace_id,
       a.id,
       release.asset_key,
       release.id,
       release.manifest
FROM agent a
JOIN managed_asset_release release ON release.id = a.managed_release_id
WHERE a.managed_release_id IS NOT NULL
  AND a.managed_state = 'active'
  AND release.asset_type = 'agent_blueprint';

INSERT INTO skill_blueprint_origin (
    workspace_id,
    skill_id,
    blueprint_asset_key,
    initialized_release_id,
    baseline_snapshot
)
SELECT skill.workspace_id,
       skill.id,
       release.asset_key,
       release.id,
       release.manifest
FROM skill
JOIN managed_asset_release release ON release.id = skill.managed_release_id
WHERE skill.managed_release_id IS NOT NULL
  AND skill.managed_state = 'active'
  AND release.asset_type = 'skill_package';
