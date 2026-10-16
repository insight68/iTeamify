CREATE UNIQUE INDEX CONCURRENTLY skill_file_skill_id_path_key ON public.skill_file USING btree (skill_id, path);
