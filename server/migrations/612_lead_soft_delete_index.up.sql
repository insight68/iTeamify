-- Serves the "deleted" lane on the customers page. Partial, because deleted rows
-- are expected to stay a small fraction of the table and the lane always pins
-- `record_status = 'deleted'`.
--
-- Column order matches the lane's ORDER BY (deleted_at DESC, then id DESC as the
-- tiebreak). The lane reads crm_customer_records, and the planner pushes the
-- constant record_status predicate down into the view's leads branch, so this
-- index is used even though the query names the view rather than `leads`
-- (verified with EXPLAIN ANALYZE on a 30k-row seed; see migration 611).
--
-- Alone in its own migration because CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block, and multi-statement migration files run as one implicit
-- transaction.
CREATE INDEX CONCURRENTLY idx_leads_workspace_deleted
    ON leads (workspace_id, deleted_at DESC)
    WHERE record_status = 'deleted';
