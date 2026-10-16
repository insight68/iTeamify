-- name: UpsertChatContextResource :one
INSERT INTO chat_context_resource (
    workspace_id,
    chat_session_id,
    resource_type,
    resource_id,
    resource_version,
    label,
    source,
    created_by_user_id
)
VALUES (
    sqlc.arg('workspace_id'),
    sqlc.arg('chat_session_id'),
    sqlc.arg('resource_type'),
    sqlc.arg('resource_id'),
    sqlc.narg('resource_version'),
    sqlc.arg('label'),
    sqlc.arg('source'),
    sqlc.arg('created_by_user_id')
)
ON CONFLICT (chat_session_id, resource_type, resource_id)
DO UPDATE SET
    resource_version = EXCLUDED.resource_version,
    label = EXCLUDED.label,
    source = EXCLUDED.source,
    created_by_user_id = EXCLUDED.created_by_user_id,
    updated_at = now()
WHERE chat_context_resource.workspace_id = EXCLUDED.workspace_id
RETURNING *;

-- name: ListChatContextResources :many
SELECT *
FROM chat_context_resource
WHERE workspace_id = $1 AND chat_session_id = $2
ORDER BY created_at ASC, id ASC;

-- name: DeleteChatContextResource :execrows
DELETE FROM chat_context_resource
WHERE id = $1 AND workspace_id = $2 AND chat_session_id = $3;

-- name: DeleteChatContextResourcesBySession :exec
DELETE FROM chat_context_resource
WHERE chat_session_id = $1;
