CREATE INDEX CONCURRENTLY auth_challenge_email_purpose ON auth_challenge (email, purpose, created_at DESC);
