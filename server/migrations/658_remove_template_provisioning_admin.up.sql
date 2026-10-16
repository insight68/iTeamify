-- Remove the template control plane while preserving workspace-owned content
-- and the independent system OpenAgent execution policy.
DELETE FROM agent_task_queue WHERE provisioning_operation_id IS NOT NULL;
UPDATE agent a SET execution_policy_key = CASE
 WHEN EXISTS (SELECT 1 FROM agent_runtime r WHERE r.id = a.runtime_id AND r.provider = 'openagent' AND r.profile_id IS NULL)
 THEN 'workspace_openagent_v1' ELSE 'general' END
WHERE execution_policy_key = 'managed_chat_v1';

-- Release bindings may duplicate the system handle. Preserve the existing
-- non-Offering handle and rebind workspace agents and retained tasks to it.
CREATE TEMP TABLE retired_runtime_map ON COMMIT DROP AS
SELECT id, first_value(id) OVER (
 PARTITION BY workspace_id, daemon_id, provider
 ORDER BY (offering_release_id IS NULL) DESC, created_at, id
) AS keeper_id
FROM agent_runtime WHERE profile_id IS NULL AND daemon_id IS NOT NULL;
UPDATE agent a SET runtime_id = m.keeper_id FROM retired_runtime_map m WHERE a.runtime_id=m.id AND m.id<>m.keeper_id;
UPDATE agent_task_queue t SET runtime_id = m.keeper_id FROM retired_runtime_map m WHERE t.runtime_id=m.id AND m.id<>m.keeper_id;
DELETE FROM agent_runtime r USING retired_runtime_map m WHERE r.id=m.id AND m.id<>m.keeper_id;
DROP TABLE retired_runtime_map;

DROP TABLE IF EXISTS agent_blueprint_suggestion;
DROP TABLE IF EXISTS skill_blueprint_origin;
DROP TABLE IF EXISTS agent_blueprint_origin;
DROP TABLE IF EXISTS workspace_managed_mcp_binding;
DROP TABLE IF EXISTS managed_mcp_credential_seed;
DROP TABLE IF EXISTS managed_assembly_rollout_target;
DROP TABLE IF EXISTS managed_assembly_rollout;
DROP TABLE IF EXISTS managed_provisioning_audit_event;
DROP TABLE IF EXISTS managed_asset_candidate;
DROP TABLE IF EXISTS workspace_managed_deployment;
DROP TABLE IF EXISTS workspace_provisioning_operation;
DROP TABLE IF EXISTS new_workspace_provisioning_policy;
DROP TABLE IF EXISTS managed_asset_release;
DROP TABLE IF EXISTS platform_openagent_config;

ALTER TABLE agent_runtime
    DROP COLUMN IF EXISTS offering_release_id,
    DROP COLUMN IF EXISTS managed_content_hash,
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_at,
    DROP COLUMN IF EXISTS managed_state;

ALTER TABLE agent
    DROP COLUMN IF EXISTS managed_release_id,
    DROP COLUMN IF EXISTS managed_content_hash,
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_mcp_release_ids,
    DROP COLUMN IF EXISTS managed_at,
    DROP COLUMN IF EXISTS managed_state;

ALTER TABLE skill
    DROP COLUMN IF EXISTS managed_release_id,
    DROP COLUMN IF EXISTS managed_content_hash,
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_at,
    DROP COLUMN IF EXISTS managed_state;

ALTER TABLE agent_task_queue
    DROP COLUMN IF EXISTS provisioning_operation_id,
    DROP COLUMN IF EXISTS managed_probe_nonce;

ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_execution_policy_key_check;
ALTER TABLE agent ADD CONSTRAINT agent_execution_policy_key_check CHECK (execution_policy_key IN ('general','workspace_openagent_v1'));
