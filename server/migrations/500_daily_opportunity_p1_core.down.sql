DROP TABLE IF EXISTS daily_opportunity_event;
DROP TABLE IF EXISTS daily_opportunity_candidate;
ALTER TABLE daily_opportunity_item DROP COLUMN IF EXISTS source_candidate_id;
