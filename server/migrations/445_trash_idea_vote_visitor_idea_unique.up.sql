CREATE UNIQUE INDEX CONCURRENTLY trash_idea_vote_visitor_idea_uidx ON trash_idea_vote (workspace_id, visitor_id, idea_id);
