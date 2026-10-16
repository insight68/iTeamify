-- Retire Trash Idea Arena. These five tables are owned solely by the arena
-- feature, so dropping them also removes the primary-key constraints added in
-- 452 and the indexes created in 438-453. No foreign keys exist (437 models
-- relationships as application-managed soft references), so DROP order is
-- free.

DROP TABLE IF EXISTS trash_idea_review;
DROP TABLE IF EXISTS trash_idea_report;
DROP TABLE IF EXISTS trash_idea_vote;
DROP TABLE IF EXISTS trash_idea;
DROP TABLE IF EXISTS trash_idea_visitor;
