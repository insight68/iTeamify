-- name: CreateProjectWorkflow :one
INSERT INTO project_workflow (project_id, acceptance_criteria, created_by, state)
VALUES ($1, $2, $3, $4) RETURNING *;

-- name: GetProjectWorkflow :one
SELECT * FROM project_workflow WHERE project_id = $1;

-- name: LockProjectWorkflow :one
SELECT * FROM project_workflow WHERE project_id = $1 FOR UPDATE;

-- name: ListProjectWorkflows :many
SELECT sqlc.embed(p), sqlc.embed(w), COALESCE(i.status, '')::text AS execution_status
FROM project p JOIN project_workflow w ON w.project_id = p.id
LEFT JOIN issue i ON i.id = w.execution_issue_id AND i.workspace_id = p.workspace_id
WHERE p.workspace_id = $1 ORDER BY p.created_at DESC;

-- name: SaveProjectWorkflow :one
UPDATE project_workflow SET acceptance_criteria = $2, execution_issue_id = $3,
state = $4, result = $5, review_note = $6, reviewed_by = $7,
version = version + 1, updated_at = now()
WHERE project_id = $1 RETURNING *;

-- name: DeleteProjectWorkflow :exec
DELETE FROM project_workflow WHERE project_id = $1;

-- name: GetProjectWorkflowResult :one
SELECT content FROM comment WHERE issue_id = $1 AND workspace_id = $2
AND author_type = 'agent' AND author_id = sqlc.arg('author_id') AND type = 'comment' AND btrim(content) <> ''
AND created_at >= sqlc.arg('since')::timestamptz
ORDER BY created_at DESC, id DESC LIMIT 1;

-- name: UnlinkProjectIssues :exec
UPDATE issue SET project_id = NULL WHERE project_id = $1 AND workspace_id = $2;

-- name: LockProjectExecution :one
SELECT * FROM issue WHERE id = $1 AND workspace_id = $2 FOR UPDATE;

-- name: HasProjectExecutionTask :one
SELECT EXISTS (SELECT 1 FROM agent_task_queue WHERE issue_id = $1
AND status IN ('queued', 'dispatched', 'running', 'waiting_local_directory', 'deferred'))::boolean;

-- name: IsProjectWorkflowExecution :one
SELECT EXISTS (SELECT 1 FROM project_workflow WHERE execution_issue_id = $1)::boolean;

-- name: DeleteWorkspaceProjectWorkflows :exec
DELETE FROM project_workflow USING project
WHERE project_workflow.project_id = project.id AND project.workspace_id = $1;

-- name: LockProjectWorkspace :one
SELECT id FROM workspace WHERE id = $1 FOR KEY SHARE;
