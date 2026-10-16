-- name: LockOutboundEmailSession :one
SELECT id FROM chat_session
WHERE id = @chat_session_id AND workspace_id = @workspace_id AND creator_id = @user_id
FOR KEY SHARE;

-- name: CreateOutboundEmail :one
INSERT INTO outbound_email (workspace_id, user_id, chat_session_id, task_id, connection_id,
    from_address, to_addresses, cc_addresses, bcc_addresses, subject, body, attachments)
VALUES ( @workspace_id, @user_id, @chat_session_id, sqlc.narg(task_id), @connection_id,
    @from_address, @to_addresses, @cc_addresses, @bcc_addresses, @subject, @body, @attachments)
RETURNING *;

-- name: GetOwnedOutboundEmail :one
SELECT * FROM outbound_email WHERE id = @id AND workspace_id = @workspace_id AND user_id = @user_id;

-- name: ListOwnedOutboundEmails :many
SELECT * FROM outbound_email
WHERE outbound_email.workspace_id = @workspace_id AND user_id = @user_id
    AND (sqlc.narg(chat_session_id)::uuid IS NULL OR chat_session_id = sqlc.narg(chat_session_id))
ORDER BY created_at DESC, id DESC LIMIT 100;

-- name: UpdateOutboundEmailDraft :one
UPDATE outbound_email SET connection_id = @connection_id, from_address = @from_address,
    to_addresses = @to_addresses, cc_addresses = @cc_addresses, bcc_addresses = @bcc_addresses,
    subject = @subject, body = @body, attachments = @attachments, version = version + 1, updated_at = now()
WHERE id = @id AND workspace_id = @workspace_id AND user_id = @user_id
    AND version = @expected_version AND status = 'draft'
RETURNING *;

-- name: QueueOutboundEmail :one
UPDATE outbound_email SET status = 'queued', queued_at = now(), available_at = now(), updated_at = now()
WHERE id = @id AND workspace_id = @workspace_id AND user_id = @user_id
    AND version = @expected_version AND status = 'draft'
RETURNING *;

-- name: ClaimOutboundEmail :one
WITH candidate AS (
    SELECT id FROM outbound_email WHERE status = 'queued' AND available_at <= now()
    ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE outbound_email e SET status = 'sending', attempts = attempts + 1,
    claim_token = gen_random_uuid(), lease_until = now() + interval '2 minutes', updated_at = now()
FROM candidate WHERE e.id = candidate.id RETURNING e.*;

-- name: ExpireOutboundEmailClaims :exec
-- A crashed send may already have reached Gmail. It must never be re-queued.
UPDATE outbound_email SET status = 'unknown', error_code = 'gmail_send_unknown', updated_at = now()
WHERE status = 'sending' AND lease_until < now();

-- name: FinishOutboundEmail :execrows
UPDATE outbound_email SET status = @status, error_code = @error_code,
    gmail_message_id = @gmail_message_id, gmail_thread_id = @gmail_thread_id,
    sent_at = CASE WHEN @status::text = 'sent' THEN now() ELSE NULL END,
    available_at = now() + sqlc.arg(retry_after)::interval, lease_until = NULL, updated_at = now()
WHERE id = @id AND claim_token = @claim_token AND status = 'sending' AND lease_until > now();
