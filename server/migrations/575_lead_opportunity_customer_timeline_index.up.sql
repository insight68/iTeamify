-- Backs the P2 risk queue: "still in play, but the customer's own timeline has
-- already passed". Partial on both stage and the null test, because that queue
-- only ever looks at open opportunities that actually carry a customer
-- timeline. A NULL timeline is not an overdue one -- "never asked" and "asked
-- and already blown" are different states, and only the latter belongs here.
--
-- Single statement in its own file: CREATE INDEX CONCURRENTLY cannot run inside
-- the implicit transaction the migration runner wraps multi-statement files in.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_opportunity_workspace_customer_timeline
    ON lead_opportunity (workspace_id, customer_timeline)
    WHERE stage NOT IN ('won', 'lost') AND customer_timeline IS NOT NULL;
