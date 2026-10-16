-- =====================
-- Native Gmail
-- =====================

-- name: CreateGmailOAuthState :exec
INSERT INTO gmail_oauth_state (
    state_hash, user_id, workspace_id, return_path, expires_at
) VALUES (
    @state_hash, @user_id, @workspace_id, @return_path, @expires_at
);

-- name: ConsumeGmailOAuthState :one
UPDATE gmail_oauth_state
SET consumed_at = now()
WHERE state_hash = @state_hash
  AND consumed_at IS NULL
  AND expires_at > now()
RETURNING *;

-- name: DeleteExpiredGmailOAuthStates :execrows
DELETE FROM gmail_oauth_state
WHERE expires_at < now() - interval '1 hour';

-- name: UpsertUserGmailConnection :one
INSERT INTO user_gmail_connection (
    user_id, email_address, refresh_token_ciphertext, granted_scopes,
    status, history_id, last_error_code, last_error_at, disconnected_at
) VALUES (
    @user_id, @email_address, @refresh_token_ciphertext, @granted_scopes,
    'active', sqlc.narg('history_id'), NULL, NULL, NULL
)
ON CONFLICT (user_id, lower(email_address)) DO UPDATE SET
    refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
    granted_scopes = EXCLUDED.granted_scopes,
    status = 'active',
    history_id = COALESCE(EXCLUDED.history_id, user_gmail_connection.history_id),
    last_error_code = NULL,
    last_error_at = NULL,
    disconnected_at = NULL,
    updated_at = now()
RETURNING *;

-- name: ListUserGmailConnections :many
SELECT c.*,
       COALESCE((SELECT COUNT(*) FROM gmail_message m WHERE m.connection_id = c.id), 0)::BIGINT AS message_count,
       COALESCE((SELECT COUNT(*) FROM gmail_message m WHERE m.connection_id = c.id AND m.analysis_status = 'completed'), 0)::BIGINT AS analyzed_count,
       COALESCE(b.enabled, false)::BOOLEAN AS analysis_enabled
FROM user_gmail_connection c
LEFT JOIN gmail_analysis_binding b
  ON b.connection_id = c.id AND b.workspace_id = @workspace_id
WHERE c.user_id = @user_id AND c.status <> 'disconnected'
ORDER BY c.connected_at DESC;

-- name: GetOwnedGmailConnection :one
SELECT * FROM user_gmail_connection
WHERE id = @id AND user_id = @user_id;

-- name: LockOwnedGmailConnection :one
SELECT * FROM user_gmail_connection
WHERE id = @id AND user_id = @user_id
FOR UPDATE;

-- name: LockGmailConnectionForMessageWrite :one
SELECT id FROM user_gmail_connection
WHERE id = @connection_id AND status IN ('active', 'attention')
FOR KEY SHARE;

-- name: GetGmailConnection :one
SELECT * FROM user_gmail_connection
WHERE id = @id;

-- name: GetUserGmailConnectionByEmail :one
SELECT * FROM user_gmail_connection
WHERE user_id = @user_id AND lower(email_address) = lower(@email_address);

-- name: EnqueueGmailPushByEmail :many
-- One Pub/Sub notification can map to the same mailbox connected by multiple
-- iTeamify users. Enqueue every matching connection atomically in one round trip
-- so a partial loop cannot acknowledge only some recipients.
INSERT INTO gmail_sync_job (
    connection_id, generation, target_history_id, status, available_at
)
SELECT c.id, 1, sqlc.narg('target_history_id'), 'pending', now()
FROM user_gmail_connection c
WHERE lower(c.email_address) = lower(@email_address)
  AND c.status IN ('active', 'attention')
  AND COALESCE(c.last_error_code, '') NOT IN ('gmail_auth_expired', 'gmail_permission_denied')
ON CONFLICT (connection_id) DO UPDATE SET
    generation = gmail_sync_job.generation + 1,
    target_history_id = COALESCE(EXCLUDED.target_history_id, gmail_sync_job.target_history_id),
    status = CASE WHEN gmail_sync_job.status = 'processing' THEN 'processing' ELSE 'pending' END,
    available_at = CASE WHEN gmail_sync_job.status = 'idle' THEN now() ELSE gmail_sync_job.available_at END,
    updated_at = now()
RETURNING connection_id;

-- name: EnqueueDueGmailPolls :many
-- Claim idle jobs and make them pending in one database round trip. Locking the
-- job rows with SKIP LOCKED prevents every API replica from selecting the same
-- due mailboxes and repeatedly incrementing their generations.
WITH candidates AS (
    SELECT j.connection_id
    FROM gmail_sync_job j
    JOIN user_gmail_connection c ON c.id = j.connection_id
    WHERE j.status = 'idle'
      AND c.status IN ('active', 'attention')
      AND COALESCE(c.last_error_code, '') NOT IN ('gmail_auth_expired', 'gmail_permission_denied')
      AND (
          c.last_sync_at IS NULL
          OR c.last_sync_at < now() - (sqlc.arg('poll_interval_seconds')::INTEGER * interval '1 second')
      )
    ORDER BY c.last_sync_at ASC NULLS FIRST
    FOR UPDATE OF j SKIP LOCKED
    LIMIT @row_limit
)
UPDATE gmail_sync_job j
SET generation = j.generation + 1,
    status = 'pending',
    available_at = now(),
    updated_at = now()
FROM candidates
WHERE j.connection_id = candidates.connection_id
RETURNING j.connection_id;

-- name: ClaimGmailConnectionForWatchRenewal :one
WITH candidate AS (
    SELECT id
    FROM user_gmail_connection
    WHERE status IN ('active', 'attention')
      AND COALESCE(last_error_code, '') NOT IN ('gmail_auth_expired', 'gmail_permission_denied')
      -- Gmail watches expire within seven days and Google recommends renewing
      -- them daily. Enter the renewal window once fewer than six days remain.
      AND (watch_expiration IS NULL OR watch_expiration < now() + interval '6 days')
    ORDER BY watch_expiration ASC NULLS FIRST
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE user_gmail_connection c
-- Push the claimed row one hour beyond the six-day renewal window. If this
-- process dies, it naturally becomes claimable again after one hour.
SET watch_expiration = now() + interval '145 hours',
    updated_at = now()
FROM candidate
WHERE c.id = candidate.id
RETURNING c.*;

-- name: DeleteGmailConnectionChildren :exec
-- Called inside the same transaction after LockOwnedGmailConnection. The row
-- lock serializes this cleanup with UpsertGmailMessage's FOR KEY SHARE lock.
WITH deleted_outbound AS (
    DELETE FROM outbound_email WHERE outbound_email.connection_id = @target_connection_id
), deleted_messages AS (
    DELETE FROM gmail_message m
    WHERE m.connection_id = @target_connection_id
), deleted_bindings AS (
    DELETE FROM gmail_analysis_binding b
    WHERE b.connection_id = @target_connection_id
), deleted_jobs AS (
    DELETE FROM gmail_sync_job j
    WHERE j.connection_id = @target_connection_id
)
DELETE FROM inbox_item
WHERE type = 'gmail_analysis'
  AND details->>'connection_id' = sqlc.arg('connection_id_text')::TEXT;

-- name: DeleteGmailConnection :execrows
DELETE FROM user_gmail_connection
WHERE id = @connection_id;

-- name: UpdateGmailConnectionWatch :exec
UPDATE user_gmail_connection
SET watch_expiration = @watch_expiration,
    status = 'active',
    last_error_code = NULL,
    last_error_at = NULL,
    updated_at = now()
WHERE id = @id;

-- name: UpdateGmailConnectionSyncCursor :exec
UPDATE user_gmail_connection
SET history_id = @history_id,
    last_sync_at = now(),
    status = 'active',
    last_error_code = NULL,
    last_error_at = NULL,
    updated_at = now()
WHERE id = @id;

-- name: MarkGmailConnectionAttention :exec
UPDATE user_gmail_connection
SET status = 'attention',
    last_error_code = @last_error_code,
    last_error_at = now(),
    updated_at = now()
WHERE id = @id AND status <> 'disconnected';

-- name: LockGmailBindingScope :one
-- Gmail bindings deliberately have no database foreign keys. Pair this shared
-- lock with LockWorkspaceForDelete's FOR UPDATE and LockMemberForRemoval's FOR
-- UPDATE so a binding cannot commit after either parent cleanup has already
-- swept its rows. Lock both parents before inserting or updating a binding.
SELECT w.id AS workspace_id, m.id AS member_id
FROM workspace w
JOIN member m
  ON m.workspace_id = w.id
 AND m.user_id = @user_id
WHERE w.id = @workspace_id
FOR KEY SHARE OF w, m;

-- name: UpsertGmailAnalysisBinding :one
INSERT INTO gmail_analysis_binding (
    connection_id, workspace_id, recipient_user_id, enabled
) VALUES (
    @connection_id, @workspace_id, @recipient_user_id, true
)
ON CONFLICT (connection_id, workspace_id) DO UPDATE SET
    recipient_user_id = EXCLUDED.recipient_user_id,
    enabled = true,
    updated_at = now()
RETURNING *;

-- name: ListGmailAnalysisBindings :many
SELECT * FROM gmail_analysis_binding
WHERE connection_id = @connection_id
ORDER BY created_at ASC;

-- name: GetGmailAnalysisBindingForWorkspace :one
SELECT * FROM gmail_analysis_binding
WHERE connection_id = @connection_id AND workspace_id = @workspace_id;

-- name: ListEnabledGmailAnalysisBindings :many
SELECT * FROM gmail_analysis_binding
WHERE connection_id = @connection_id AND enabled = true
ORDER BY created_at ASC;

-- name: DeleteGmailAnalysisBindingsByWorkspaceUser :exec
WITH deleted_outbound AS (
    DELETE FROM outbound_email WHERE outbound_email.workspace_id = @workspace_id AND outbound_email.user_id = @user_id
)
DELETE FROM gmail_analysis_binding
WHERE gmail_analysis_binding.workspace_id = @workspace_id AND gmail_analysis_binding.recipient_user_id = @user_id;

-- name: UpdateOwnedGmailAnalysisBinding :one
UPDATE gmail_analysis_binding b
SET enabled = @enabled,
    notify_threshold = @notify_threshold,
    updated_at = now()
FROM user_gmail_connection c
WHERE b.id = @id
  AND c.id = b.connection_id
  AND c.user_id = @user_id
RETURNING b.*;

-- name: UpsertGmailSyncJob :one
INSERT INTO gmail_sync_job (
    connection_id, generation, target_history_id, status, available_at
) VALUES (
    @connection_id, 1, sqlc.narg('target_history_id'), 'pending', now()
)
ON CONFLICT (connection_id) DO UPDATE SET
    generation = gmail_sync_job.generation + 1,
    target_history_id = COALESCE(EXCLUDED.target_history_id, gmail_sync_job.target_history_id),
    status = CASE WHEN gmail_sync_job.status = 'processing' THEN 'processing' ELSE 'pending' END,
    available_at = CASE WHEN gmail_sync_job.status = 'idle' THEN now() ELSE gmail_sync_job.available_at END,
    updated_at = now()
RETURNING *;

-- name: ClaimGmailSyncJob :one
WITH candidate AS (
    SELECT connection_id
    FROM gmail_sync_job
    WHERE (
        status = 'pending'
        OR (status = 'processing' AND lease_expires_at < now())
    )
      AND available_at <= now()
    ORDER BY available_at ASC, updated_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE gmail_sync_job j
SET status = 'processing',
    lease_owner = @lease_owner,
    lease_expires_at = now() + interval '2 minutes',
    attempt_count = j.attempt_count + 1,
    updated_at = now()
FROM candidate
WHERE j.connection_id = candidate.connection_id
RETURNING j.*;

-- name: RenewGmailSyncJobLease :execrows
UPDATE gmail_sync_job
SET lease_expires_at = now() + interval '2 minutes', updated_at = now()
WHERE connection_id = @connection_id
  AND status = 'processing'
  AND lease_owner = @lease_owner;

-- name: CompleteGmailSyncJob :exec
UPDATE gmail_sync_job
SET status = CASE WHEN generation = @generation THEN 'idle' ELSE 'pending' END,
    available_at = CASE WHEN generation = @generation THEN available_at ELSE now() END,
    attempt_count = CASE WHEN generation = @generation THEN 0 ELSE attempt_count END,
    lease_owner = NULL,
    lease_expires_at = NULL,
    last_error_code = NULL,
    updated_at = now()
WHERE connection_id = @connection_id AND lease_owner = @lease_owner;

-- name: FailGmailSyncJob :exec
UPDATE gmail_sync_job
SET status = 'pending',
    available_at = now() + @retry_after::interval,
    lease_owner = NULL,
    lease_expires_at = NULL,
    last_error_code = @last_error_code,
    updated_at = now()
WHERE connection_id = @connection_id AND lease_owner = @lease_owner;

-- name: ParkGmailSyncJob :exec
UPDATE gmail_sync_job
SET status = 'idle',
    lease_owner = NULL,
    lease_expires_at = NULL,
    last_error_code = @last_error_code,
    updated_at = now()
WHERE connection_id = @connection_id AND lease_owner = @lease_owner;

-- name: UpsertGmailMessage :one
INSERT INTO gmail_message (
    connection_id, gmail_message_id, gmail_thread_id, gmail_history_id,
    internal_date, sender, recipients, subject, snippet, body_text,
    label_ids, size_estimate, analysis_status
) VALUES (
    @connection_id, @gmail_message_id, @gmail_thread_id, sqlc.narg('gmail_history_id'),
    @internal_date, @sender, @recipients, @subject, @snippet,
    CASE WHEN EXISTS (
        SELECT 1 FROM gmail_analysis_binding b
        WHERE b.connection_id = @connection_id AND b.enabled = true
    ) THEN @body_text ELSE '' END,
    @label_ids, @size_estimate,
    CASE WHEN EXISTS (
        SELECT 1 FROM gmail_analysis_binding b
        WHERE b.connection_id = @connection_id AND b.enabled = true
    ) THEN 'pending' ELSE 'skipped' END
)
ON CONFLICT (connection_id, gmail_message_id) DO UPDATE SET
    gmail_thread_id = EXCLUDED.gmail_thread_id,
    gmail_history_id = COALESCE(EXCLUDED.gmail_history_id, gmail_message.gmail_history_id),
    label_ids = EXCLUDED.label_ids,
    updated_at = now()
RETURNING *;

-- name: ClaimGmailMessageForAnalysis :one
WITH candidate AS (
    SELECT m.id
    FROM gmail_message m
    WHERE (
        m.analysis_status = 'pending'
        OR (m.analysis_status = 'failed' AND m.analysis_attempt_count < 5)
        OR (m.analysis_status = 'processing' AND m.analysis_lease_expires_at < now())
    )
      AND m.analysis_available_at <= now()
      AND EXISTS (
          SELECT 1 FROM gmail_analysis_binding b
          WHERE b.connection_id = m.connection_id AND b.enabled = true
      )
    ORDER BY m.analysis_available_at ASC, m.internal_date ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE gmail_message m
SET analysis_status = 'processing',
    analysis_lease_owner = @lease_owner,
    analysis_lease_expires_at = now() + interval '2 minutes',
    analysis_attempt_count = m.analysis_attempt_count + 1,
    updated_at = now()
FROM candidate
WHERE m.id = candidate.id
RETURNING m.*;

-- name: CompleteGmailMessageAnalysis :one
UPDATE gmail_message
SET analysis_status = 'completed',
    analysis_result = @analysis_result,
    analysis_error_code = NULL,
    analyzed_at = now(),
    body_text = '',
    analysis_lease_owner = NULL,
    analysis_lease_expires_at = NULL,
    updated_at = now()
WHERE id = @id AND analysis_lease_owner = @lease_owner
RETURNING *;

-- name: RenewGmailMessageAnalysisLease :execrows
UPDATE gmail_message
SET analysis_lease_expires_at = now() + interval '2 minutes', updated_at = now()
WHERE id = @id
  AND analysis_status = 'processing'
  AND analysis_lease_owner = @lease_owner;

-- name: ScrubExpiredGmailMessageBodies :execrows
WITH candidates AS (
    SELECT id
    FROM gmail_message
    WHERE body_text <> '' AND created_at < now() - interval '30 days'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1000
)
UPDATE gmail_message m
SET body_text = '', updated_at = now()
FROM candidates
WHERE m.id = candidates.id;

-- name: FailGmailMessageAnalysis :exec
UPDATE gmail_message
SET analysis_status = 'failed',
    analysis_available_at = now() + @retry_after::interval,
    analysis_error_code = @analysis_error_code,
    analysis_lease_owner = NULL,
    analysis_lease_expires_at = NULL,
    updated_at = now()
WHERE id = @id AND analysis_lease_owner = @lease_owner;
