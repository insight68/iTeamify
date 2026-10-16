ALTER TABLE gmail_message DROP CONSTRAINT IF EXISTS gmail_message_pkey;
ALTER TABLE gmail_sync_job DROP CONSTRAINT IF EXISTS gmail_sync_job_pkey;
ALTER TABLE gmail_analysis_binding DROP CONSTRAINT IF EXISTS gmail_analysis_binding_pkey;
ALTER TABLE gmail_oauth_state DROP CONSTRAINT IF EXISTS gmail_oauth_state_pkey;
ALTER TABLE user_gmail_connection DROP CONSTRAINT IF EXISTS user_gmail_connection_pkey;
