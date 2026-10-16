-- Reddit V1: credentials and approved reply jobs only; fetched content is not persisted.
CREATE TABLE reddit_connection (
 id UUID NOT NULL DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
 user_id UUID NOT NULL, reddit_user_id TEXT NOT NULL, username TEXT NOT NULL,
 refresh_token BYTEA NOT NULL, scopes TEXT NOT NULL, can_reply BOOLEAN NOT NULL DEFAULT false,
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reddit_oauth_state (
 state_hash BYTEA NOT NULL CHECK (octet_length(state_hash)=32), workspace_id UUID NOT NULL,
 user_id UUID NOT NULL, connection_id UUID, can_reply BOOLEAN NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE TABLE reddit_reply_draft (
 id UUID NOT NULL DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL, connection_id UUID NOT NULL,
 requested_by UUID NOT NULL, task_id UUID, target_fullname TEXT NOT NULL,
 subreddit TEXT NOT NULL, post_fullname TEXT NOT NULL, target_version TEXT NOT NULL,
 body TEXT NOT NULL CHECK (char_length(body)<=9500), version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','sending','sent','failed','unknown','cancelled')),
 approved_by UUID, approved_at TIMESTAMPTZ, approved_version INTEGER,
 available_at TIMESTAMPTZ NOT NULL DEFAULT now(), lease_until TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0, sent_fullname TEXT NOT NULL DEFAULT '', error_code TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '48 hours',
 source_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (status NOT IN ('queued','sending','sent','unknown') OR
   (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_version=version))
);
CREATE TABLE reddit_request_budget (
 client_id TEXT NOT NULL, remaining INTEGER NOT NULL DEFAULT 90,
 reset_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '1 minute',
 blocked_until TIMESTAMPTZ NOT NULL DEFAULT now()
);
