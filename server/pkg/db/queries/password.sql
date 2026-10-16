-- name: GetUserPassword :one
SELECT * FROM user_password WHERE user_id = $1;

-- name: GetUserAuthVersion :one
SELECT COALESCE((SELECT auth_version FROM user_password WHERE user_id = $1), 0)::bigint AS auth_version
WHERE EXISTS (SELECT 1 FROM "user" WHERE id = $1);

-- name: SetUserPassword :one
INSERT INTO user_password (user_id, password_hash)
VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    auth_version = user_password.auth_version + 1,
    changed_at = now()
RETURNING *;

-- name: LockAuthEmail :exec
SELECT pg_advisory_xact_lock(hashtextextended('auth-email:' || sqlc.arg(email)::text, 0));

-- name: CreateAuthChallenge :one
INSERT INTO auth_challenge (id, email, purpose, code_hash, expires_at)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: GetAuthChallengeForUpdate :one
SELECT * FROM auth_challenge WHERE id = $1 AND email = $2 AND purpose = $3 FOR UPDATE;

-- name: GetLatestAuthChallenge :one
SELECT * FROM auth_challenge WHERE email = $1 AND purpose = $2 AND delivery_failed = FALSE
ORDER BY created_at DESC LIMIT 1;

-- name: MarkAuthChallengeSent :exec
UPDATE auth_challenge SET sent_at = now() WHERE id = $1;

-- name: MarkAuthChallengeDeliveryFailed :exec
UPDATE auth_challenge SET delivery_failed = TRUE, used_at = now() WHERE id = $1;

-- name: IncrementAuthChallengeAttempts :exec
UPDATE auth_challenge SET attempts = attempts + 1 WHERE id = $1;

-- name: VerifyAuthChallenge :exec
UPDATE auth_challenge SET verified_at = now(), proof_hash = $2, proof_expires_at = now() + interval '10 minutes'
WHERE id = $1;

-- name: ConsumeAuthChallenge :exec
UPDATE auth_challenge SET used_at = now() WHERE id = $1;

-- name: InvalidateAuthChallenges :exec
UPDATE auth_challenge SET used_at = now() WHERE email = $1 AND purpose = $2 AND used_at IS NULL;

-- name: InvalidatePasswordChallenges :exec
UPDATE auth_challenge SET used_at = now()
WHERE email = $1 AND purpose IN ('reset', 'set_password', 'login') AND used_at IS NULL;

-- name: DeleteUserPassword :exec
DELETE FROM user_password WHERE user_id = $1;

-- name: DeleteUserAuthChallenges :exec
DELETE FROM auth_challenge WHERE email = $1;

-- name: PromoteAuthChallengeToSignup :exec
UPDATE auth_challenge SET purpose = 'signup' WHERE id = $1;

-- name: RecordPasswordLoginAttempt :one
INSERT INTO password_login_attempt (email) VALUES ($1)
ON CONFLICT (email) DO UPDATE SET
    attempts = CASE WHEN password_login_attempt.window_started_at < now() - interval '15 minutes' THEN 1 ELSE password_login_attempt.attempts + 1 END,
    window_started_at = CASE WHEN password_login_attempt.window_started_at < now() - interval '15 minutes' THEN now() ELSE password_login_attempt.window_started_at END
RETURNING attempts;

-- name: ClearPasswordLoginAttempts :exec
DELETE FROM password_login_attempt WHERE email = $1;

-- name: DeleteExpiredAuthChallenges :exec
DELETE FROM auth_challenge WHERE expires_at < now() - interval '1 day';

-- name: DeleteExpiredPasswordAttempts :exec
DELETE FROM password_login_attempt WHERE window_started_at < now() - interval '1 day';

-- name: DeleteVerificationCodesByEmail :exec
DELETE FROM verification_code WHERE email = $1;
