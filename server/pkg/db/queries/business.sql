-- Workspace business context, immutable releases, and AI change proposals.
-- Every read and write is scoped by workspace_id.

-- name: GetBusinessContext :one
SELECT * FROM business_context
WHERE workspace_id = $1;

-- name: LockBusinessContext :one
SELECT * FROM business_context
WHERE workspace_id = $1
FOR UPDATE;

-- name: CreateBusinessContextDraft :one
INSERT INTO business_context (
    workspace_id, draft_revision, draft_content, updated_by_user_id
) VALUES ($1, 1, $2, $3)
RETURNING *;

-- name: UpdateBusinessContextDraft :one
UPDATE business_context
SET draft_content = $2,
    draft_revision = draft_revision + 1,
    updated_by_user_id = $3,
    updated_at = now()
WHERE workspace_id = $1
  AND draft_revision = $4
RETURNING *;

-- name: PublishBusinessContext :one
UPDATE business_context
SET published_content = draft_content,
    published_version = published_version + 1,
    published_by_user_id = $2,
    published_at = now(),
    updated_at = now()
WHERE workspace_id = $1
  AND draft_revision = $3
RETURNING *;

-- name: CreateBusinessRelease :one
INSERT INTO business_release (
    workspace_id, version, draft_revision, content,
    change_summary, published_by_user_id, published_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListBusinessReleases :many
SELECT * FROM business_release
WHERE workspace_id = $1
ORDER BY version DESC
LIMIT $2;

-- name: GetBusinessRelease :one
SELECT * FROM business_release
WHERE workspace_id = $1 AND id = $2;

-- name: CreateBusinessChangeProposal :one
INSERT INTO business_change_proposal (
    workspace_id, chat_session_id, source_task_id, base_revision,
    title, rationale, operations, source_refs,
    created_by_actor_type, created_by_actor_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: ListBusinessChangeProposals :many
SELECT * FROM business_change_proposal
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY created_at DESC
LIMIT $2;

-- name: GetBusinessChangeProposal :one
SELECT * FROM business_change_proposal
WHERE workspace_id = $1 AND id = $2;

-- name: LockBusinessChangeProposal :one
SELECT * FROM business_change_proposal
WHERE workspace_id = $1 AND id = $2
FOR UPDATE;

-- name: MarkBusinessChangeProposalApplied :one
UPDATE business_change_proposal
SET status = 'applied',
    applied_revision = $3,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2 AND status = 'pending'
RETURNING *;

-- name: RejectBusinessChangeProposal :one
UPDATE business_change_proposal
SET status = 'rejected',
    rejected_reason = $3,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2 AND status = 'pending'
RETURNING *;

-- name: MarkStaleBusinessChangeProposals :execrows
UPDATE business_change_proposal
SET status = 'stale', updated_at = now()
WHERE workspace_id = $1
  AND status = 'pending'
  AND base_revision <> $2;
