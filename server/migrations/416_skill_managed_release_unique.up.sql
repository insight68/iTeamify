CREATE UNIQUE INDEX CONCURRENTLY skill_managed_release_uidx ON skill (workspace_id, managed_release_id) WHERE managed_release_id IS NOT NULL;
