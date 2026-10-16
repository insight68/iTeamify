DROP TABLE contract_submission;
ALTER TABLE contract_review DROP COLUMN application_id, DROP COLUMN application_version, DROP COLUMN application_snapshot;
ALTER TABLE chat_session DROP COLUMN application_id, DROP COLUMN application_version;
DROP TABLE session_application;
