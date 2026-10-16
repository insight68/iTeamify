-- name: EnsureCreditAccount :exec
INSERT INTO workspace_credit_account (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING;

-- name: LockCreditAccount :one
SELECT * FROM workspace_credit_account WHERE workspace_id = $1 FOR UPDATE;

-- name: GetCreditAccount :one
SELECT * FROM workspace_credit_account WHERE workspace_id = $1;

-- name: AddCreditBalance :one
UPDATE workspace_credit_account SET balance_micro = balance_micro + @amount_micro::bigint, updated_at = now()
WHERE workspace_id = $1 RETURNING *;

-- name: InsertCreditLedger :one
INSERT INTO workspace_credit_ledger (workspace_id,business_key,kind,amount_micro,balance_after,reference_id,actor_id,description)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;

-- name: GetCreditLedgerByKey :one
SELECT * FROM workspace_credit_ledger WHERE workspace_id = $1 AND business_key = $2;

-- name: ListCreditLedger :many
SELECT * FROM workspace_credit_ledger WHERE workspace_id = $1
AND (sqlc.narg('before_time')::timestamptz IS NULL OR (created_at,id) < (sqlc.narg('before_time')::timestamptz,@before_id::uuid))
ORDER BY created_at DESC,id DESC LIMIT @page_limit;

-- name: GetBillingSettings :one
SELECT * FROM billing_settings WHERE singleton = TRUE;

-- name: CreateTopupOrder :one
INSERT INTO workspace_topup_order (workspace_id,payer_user_id,request_key,amount_cents,credits_micro,credits_micro_per_usd,return_url)
VALUES ($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT (workspace_id,payer_user_id,request_key) DO UPDATE SET request_key=EXCLUDED.request_key
RETURNING *;

-- name: GetTopupOrder :one
SELECT * FROM workspace_topup_order WHERE workspace_id = $1 AND id = $2;

-- name: GetTopupOrderByRequest :one
SELECT * FROM workspace_topup_order WHERE workspace_id = $1 AND payer_user_id=$2 AND request_key=$3;

-- name: LockTopupOrder :one
SELECT * FROM workspace_topup_order WHERE workspace_id = $1 AND id = $2 FOR UPDATE;

-- name: AttachTopupSession :one
UPDATE workspace_topup_order SET stripe_checkout_id=$3, checkout_url=$4, updated_at=now()
WHERE workspace_id=$1 AND id=$2 AND (stripe_checkout_id='' OR stripe_checkout_id=$3) RETURNING *;

-- name: GetTopupBySession :one
SELECT * FROM workspace_topup_order WHERE workspace_id=$1 AND stripe_checkout_id=$2;

-- name: FulfillTopupOrder :exec
UPDATE workspace_topup_order SET status='credited', stripe_checkout_id=$3, stripe_payment_id=$4,
stripe_event_id=$5, updated_at=now() WHERE workspace_id=$1 AND id=$2;

-- name: CancelTopupOrder :exec
UPDATE workspace_topup_order SET status='canceled', stripe_checkout_id=$3, updated_at=now()
WHERE workspace_id=$1 AND id=$2 AND status='pending';

-- name: ListTopupOrders :many
SELECT * FROM workspace_topup_order WHERE workspace_id=$1
AND (sqlc.narg('before_time')::timestamptz IS NULL OR (created_at,id) < (sqlc.narg('before_time')::timestamptz,@before_id::uuid))
ORDER BY created_at DESC,id DESC LIMIT @page_limit;

-- name: HasPendingTopupOrders :one
SELECT EXISTS(SELECT 1 FROM workspace_topup_order WHERE workspace_id=$1 AND status='pending')::boolean;

-- name: LockTaskBilling :one
SELECT q.local_billing_enabled, q.status, a.workspace_id
FROM agent_task_queue q JOIN agent a ON a.id=q.agent_id WHERE q.id=$1 FOR UPDATE OF q;

-- name: GetTaskBillingWorkspace :one
SELECT a.workspace_id FROM agent_task_queue q JOIN agent a ON a.id=q.agent_id WHERE q.id=$1;

-- name: EnableTaskBilling :exec
UPDATE agent_task_queue SET local_billing_enabled=TRUE WHERE id=$1;

-- name: GetSettledTaskUsage :one
SELECT * FROM task_usage WHERE task_id=$1 AND provider=$2 AND model=$3 FOR UPDATE;

-- name: SetSettledTaskUsage :exec
UPDATE task_usage SET settled_credit_micro=$4 WHERE task_id=$1 AND provider=$2 AND model=$3;

-- name: GetWorkspaceCreditUsageSince :one
SELECT COALESCE(-SUM(l.amount_micro),0)::bigint FROM workspace_credit_ledger l
WHERE l.workspace_id=$1 AND l.kind='usage' AND l.created_at >= @since::timestamptz
AND (sqlc.narg('project_id')::uuid IS NULL OR l.reference_id IN (
 SELECT q.id::text FROM agent_task_queue q JOIN issue i ON i.id=q.issue_id
 WHERE i.workspace_id=$1 AND i.project_id=sqlc.narg('project_id')::uuid
));
