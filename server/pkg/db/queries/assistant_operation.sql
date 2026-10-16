-- name: CreateAssistantOperation :one
INSERT INTO assistant_operation (
    workspace_id, resource_type, resource_id, action, risk,
    confirmation_type, originator_user_id, agent_id, task_id,
    chat_session_id, user_intent_message_id, idempotency_key,
    expected_version, request, preview
) VALUES (
    @workspace_id, @resource_type, @resource_id, @action, @risk,
    @confirmation_type, sqlc.narg('originator_user_id'), @agent_id, @task_id,
    @chat_session_id, sqlc.narg('user_intent_message_id'), @idempotency_key,
    sqlc.narg('expected_version'), @request, @preview
)
RETURNING *;

-- name: GetAssistantOperationByIdempotencyKey :one
SELECT * FROM assistant_operation
WHERE workspace_id = @workspace_id AND idempotency_key = @idempotency_key;

-- name: CompleteAssistantOperation :one
UPDATE assistant_operation
SET status = 'succeeded',
    resource_id = @resource_id,
    result = @result,
    completed_at = now()
WHERE id = @id AND workspace_id = @workspace_id AND status = 'pending'
RETURNING *;

-- name: FailAssistantOperation :one
UPDATE assistant_operation
SET status = 'failed',
    error_code = @error_code,
    error_message = @error_message,
    completed_at = now()
WHERE id = @id AND workspace_id = @workspace_id AND status = 'pending'
RETURNING *;
