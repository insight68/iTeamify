CREATE UNIQUE INDEX CONCURRENTLY trash_idea_vote_client_uidx ON trash_idea_vote (workspace_id, visitor_id, client_vote_id);
