-- Remove the retired standalone prospecting configuration.
-- Discovery jobs, their audit records, and CRM leads are shared and remain.
DROP TABLE IF EXISTS lead_mining_settings;
