-- The migration runner's pre-hook reconciles pre-cutover data in bounded,
-- resumable source transactions. The marker is recorded only after it succeeds.
COMMENT ON TABLE accounts IS 'Canonical customer aggregate; source reconciliation completed.';
