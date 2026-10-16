-- name: ListOpenAgentDaemonWorkspaces :many
SELECT id, name, ARRAY['openagent']::text[] AS providers
FROM workspace
ORDER BY created_at ASC, id ASC;

-- name: ManagedDaemonCanAccessWorkspace :one
SELECT EXISTS (SELECT 1 FROM workspace WHERE id = @workspace_id AND @daemon_id::text IS NOT NULL) AS allowed;

-- name: GetWorkspaceOwnerForOpenAgent :one
SELECT user_id FROM member
WHERE workspace_id = $1 AND role = 'owner'
ORDER BY created_at ASC LIMIT 1;

-- name: GetWorkspaceOpenAgentConfig :one
SELECT * FROM workspace_openagent_config WHERE workspace_id=$1;

-- name: UpsertWorkspaceOpenAgentConfig :one
INSERT INTO workspace_openagent_config(workspace_id,base_url,model,api_key_encrypted,updated_by)
VALUES(@workspace_id,@base_url,@model,@api_key_encrypted,@updated_by)
ON CONFLICT(workspace_id) DO UPDATE
SET revision=workspace_openagent_config.revision+1,base_url=EXCLUDED.base_url,model=EXCLUDED.model,
 api_key_encrypted=EXCLUDED.api_key_encrypted,updated_by=EXCLUDED.updated_by,updated_at=now()
WHERE workspace_openagent_config.revision = @expected_revision::bigint
RETURNING *;
