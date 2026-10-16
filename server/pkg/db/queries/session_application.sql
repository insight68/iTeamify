-- name: ListSessionApplications :many
SELECT * FROM session_application WHERE workspace_id = @workspace_id ORDER BY created_at, id;

-- name: LockApplicationManager :one
SELECT * FROM member WHERE workspace_id = @workspace_id AND user_id = @user_id FOR SHARE;

-- name: DeleteUnreferencedRuntimeApplications :exec
DELETE FROM session_application sa USING agent a
WHERE sa.target_kind = 'agent' AND sa.target_id = a.id AND sa.workspace_id = a.workspace_id AND a.runtime_id = @runtime_id
AND (a.archived_at IS NOT NULL OR (sqlc.arg('include_system_agents')::boolean AND a.kind = 'system'))
AND NOT EXISTS (SELECT 1 FROM contract_review cr WHERE cr.application_id = sa.id AND cr.workspace_id = sa.workspace_id);

-- name: LockSessionApplication :one
SELECT * FROM session_application WHERE id = @id AND workspace_id = @workspace_id FOR UPDATE;

-- name: GetTargetSessionApplication :one
SELECT * FROM session_application WHERE workspace_id = @workspace_id AND target_kind = @target_kind AND target_id = @target_id AND application_type = @application_type;

-- name: CreateSessionApplication :one
INSERT INTO session_application (id, workspace_id, application_type, target_kind, target_id, status, config, updated_by)
VALUES (@id, @workspace_id, @application_type, @target_kind, @target_id, @status, @config, @updated_by) RETURNING *;

-- name: UpdateSessionApplication :one
UPDATE session_application SET config = @config, status = @status, version = version + 1, updated_by = @updated_by, updated_at = clock_timestamp()
WHERE id = @id AND workspace_id = @workspace_id AND version = @expected_version RETURNING *;

-- name: DeleteDraftSessionApplication :execrows
DELETE FROM session_application WHERE session_application.id = @id AND session_application.workspace_id = @workspace_id AND status = 'draft' AND session_application.version = @version
AND NOT EXISTS (SELECT 1 FROM contract_review WHERE application_id = @id AND workspace_id = @workspace_id);

-- name: BindContractApplication :exec
UPDATE contract_review SET application_id = @application_id, application_version = @application_version, application_snapshot = @application_snapshot
WHERE id = @id AND workspace_id = @workspace_id;

-- name: BindSessionApplication :exec
UPDATE chat_session SET application_id = @application_id, application_version = @application_version
WHERE id = @id AND workspace_id = @workspace_id;

-- name: CreateContractSubmission :one
INSERT INTO contract_submission (id, workspace_id, review_id, submitted_by, review_version, task_id, input)
VALUES (@id, @workspace_id, @review_id, @submitted_by, @review_version, @task_id, @input) RETURNING *;

-- name: GetContractSubmission :one
SELECT * FROM contract_submission WHERE id = @id AND workspace_id = @workspace_id;

-- name: GetContractSubmissionByTask :one
SELECT * FROM contract_submission WHERE task_id = @task_id;

-- name: GetLatestContractTask :one
SELECT t.* FROM agent_task_queue t JOIN contract_submission s ON (s.task_id = t.id OR s.task_id = t.chat_input_task_id)
WHERE s.workspace_id = @workspace_id AND s.review_id = @review_id ORDER BY s.created_at DESC, t.created_at DESC, t.id DESC LIMIT 1;

-- name: DeleteContractSubmissions :exec
DELETE FROM contract_submission WHERE workspace_id = @workspace_id AND review_id = @review_id;

-- name: DeleteWorkspaceSessionApplications :exec
DELETE FROM session_application WHERE workspace_id = @workspace_id;

-- name: DeleteWorkspaceContractSubmissions :exec
DELETE FROM contract_submission WHERE workspace_id = @workspace_id;
