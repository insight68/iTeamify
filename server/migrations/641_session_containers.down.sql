DROP TABLE contract_review_file;
DROP TABLE contract_review;
ALTER TABLE chat_session DROP COLUMN container_type, DROP COLUMN container_resource_type, DROP COLUMN container_resource_id, DROP COLUMN last_activity_at;
