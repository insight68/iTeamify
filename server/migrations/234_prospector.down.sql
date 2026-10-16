-- Reverse of 234_prospector.up.sql. Drop in dependency-safe order
-- (children before parents); no FKs to drop, so plain DROP TABLE IF EXISTS.
DROP TABLE IF EXISTS prospect_job_events;
DROP TABLE IF EXISTS prospect_leads;
DROP TABLE IF EXISTS prospect_jobs;
DROP TABLE IF EXISTS prospect_settings;
