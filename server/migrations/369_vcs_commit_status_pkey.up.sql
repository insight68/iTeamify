CREATE UNIQUE INDEX CONCURRENTLY vcs_commit_status_pkey ON public.vcs_commit_status USING btree (connection_id, sha, context);
