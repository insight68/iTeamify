CREATE UNIQUE INDEX CONCURRENTLY idx_session_application_target ON session_application (workspace_id, target_kind, target_id, application_type);
