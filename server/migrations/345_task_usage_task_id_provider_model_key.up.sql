CREATE UNIQUE INDEX CONCURRENTLY task_usage_task_id_provider_model_key ON public.task_usage USING btree (task_id, provider, model);
