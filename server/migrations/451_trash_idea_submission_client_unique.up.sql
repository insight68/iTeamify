CREATE UNIQUE INDEX CONCURRENTLY trash_idea_submission_client_uidx ON trash_idea (workspace_id, submitter_visitor_id, client_submission_id) WHERE source = 'visitor';
