CREATE UNIQUE INDEX CONCURRENTLY issue_reaction_issue_id_actor_type_actor_id_emoji_key ON public.issue_reaction USING btree (issue_id, actor_type, actor_id, emoji);
