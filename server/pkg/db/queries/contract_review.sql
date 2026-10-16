-- name: CreateContractReviewSession :one
INSERT INTO chat_session (id, workspace_id, creator_id, kind, peer_user_id, agent_id, runtime_id, title, container_type, container_resource_type, container_resource_id, last_activity_at)
VALUES (@id, @workspace_id, @creator_id, @kind, sqlc.narg('peer_user_id'), sqlc.narg('agent_id'),
    (SELECT runtime_id FROM agent WHERE id = sqlc.narg('agent_id')), @title, 'contract_review', 'contract_review', @id, now())
ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
RETURNING *;

-- name: CreateContractReview :one
INSERT INTO contract_review (id, workspace_id, creator_id, fields, last_actor_id, submission_hash)
VALUES (@id, @workspace_id, @creator_id, @fields, @creator_id, @submission_hash)
RETURNING *;

-- name: GetContractReview :one
SELECT * FROM contract_review WHERE id = @id AND workspace_id = @workspace_id;

-- name: LockContainerSession :one
SELECT * FROM chat_session WHERE id = @id AND workspace_id = @workspace_id FOR UPDATE;

-- name: LockContainerAgent :one
SELECT * FROM agent WHERE id = @id AND workspace_id = @workspace_id AND archived_at IS NULL FOR SHARE;

-- name: LockContractReview :one
SELECT * FROM contract_review WHERE id = @id AND workspace_id = @workspace_id FOR UPDATE;

-- name: UpdateContractReview :one
UPDATE contract_review SET fields = @fields, status = @status, result = @result, note = @note,
    version = version + 1, last_actor_id = @actor_id, updated_at = clock_timestamp(),
    creator_read_version = CASE WHEN creator_id = @actor_id THEN version + 1 ELSE creator_read_version END,
    peer_read_version = CASE WHEN creator_id <> @actor_id THEN version + 1 ELSE peer_read_version END
WHERE id = @id AND workspace_id = @workspace_id AND version = @expected_version
RETURNING *;

-- name: MarkContractReviewRead :exec
UPDATE contract_review SET
    creator_read_version = CASE WHEN creator_id = @user_id THEN GREATEST(creator_read_version, LEAST(@version, version)) ELSE creator_read_version END,
    peer_read_version = CASE WHEN creator_id <> @user_id THEN GREATEST(peer_read_version, LEAST(@version, version)) ELSE peer_read_version END
WHERE id = @id AND workspace_id = @workspace_id;

-- name: TouchContainerSession :exec
UPDATE chat_session SET last_activity_at = @activity_at, updated_at = @activity_at
WHERE id = @id AND workspace_id = @workspace_id;

-- name: CreateContractReviewFile :one
INSERT INTO contract_review_file (id, review_id, workspace_id, uploaded_by, filename, content_type, size_bytes, object_key, encryption_key)
VALUES (@id, @review_id, @workspace_id, @uploaded_by, @filename, @content_type, @size_bytes, @object_key, @encryption_key)
RETURNING *;

-- name: ListContractReviewFiles :many
SELECT * FROM contract_review_file WHERE workspace_id = @workspace_id AND review_id = @review_id ORDER BY created_at, id;

-- name: GetContractReviewFile :one
SELECT * FROM contract_review_file WHERE id = @id;

-- name: DeleteContractReviewFiles :many
DELETE FROM contract_review_file WHERE workspace_id = @workspace_id AND review_id = @review_id RETURNING object_key;

-- name: DeleteContractReview :exec
DELETE FROM contract_review WHERE workspace_id = @workspace_id AND id = @id;

-- name: GetContractReviewAction :one
SELECT * FROM contract_review_action WHERE review_id = @review_id AND workspace_id = @workspace_id AND request_key = @request_key;

-- name: CreateContractReviewAction :exec
INSERT INTO contract_review_action (review_id, workspace_id, request_key, request_hash, actor_id, action, note, version)
VALUES (@review_id, @workspace_id, @request_key, @request_hash, @actor_id, @action, @note, @version);

-- name: ListContractReviewActions :many
SELECT * FROM contract_review_action WHERE workspace_id = @workspace_id AND review_id = @review_id ORDER BY version DESC LIMIT 100;

-- name: DeleteContractReviewActions :exec
DELETE FROM contract_review_action WHERE workspace_id = @workspace_id AND review_id = @review_id;

-- name: DeleteWorkspaceContractReviewActions :exec
DELETE FROM contract_review_action WHERE workspace_id = @workspace_id;

-- name: DeleteWorkspaceContractReviewFiles :many
DELETE FROM contract_review_file WHERE workspace_id = @workspace_id RETURNING object_key;

-- name: DeleteWorkspaceContractReviews :exec
DELETE FROM contract_review WHERE workspace_id = @workspace_id;

-- name: ListContractSessionsByRuntime :many
SELECT cs.* FROM chat_session cs JOIN agent a ON a.id = cs.agent_id
WHERE a.runtime_id = @runtime_id AND (a.archived_at IS NOT NULL OR (sqlc.arg('include_system_agents')::boolean AND a.kind = 'system'))
AND EXISTS (SELECT 1 FROM contract_review cr WHERE cr.id = cs.id AND cr.workspace_id = cs.workspace_id) FOR UPDATE OF cs;
