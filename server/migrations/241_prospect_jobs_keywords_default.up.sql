-- Fix prospect_jobs.keywords default: was '{}'::jsonb (JSON object), should be
-- '[]'::jsonb (JSON array of strings). The service layer also initializes the
-- column to [] now, but the column default must match so direct INSERTs without
-- an explicit value produce a valid empty array, not an object that breaks
-- []string unmarshal in prospectJobToResponse.
ALTER TABLE prospect_jobs ALTER COLUMN keywords SET DEFAULT '[]'::jsonb;

-- Repair existing rows that still hold the old object default.
UPDATE prospect_jobs SET keywords = '[]'::jsonb WHERE keywords = '{}'::jsonb;
