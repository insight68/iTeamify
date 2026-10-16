-- Data migration is intentionally non-destructive on rollback. Company drafts
-- may have been reviewed or edited after import, so restoring legacy columns
-- must not erase those facts.
SELECT 1;
