-- Immutable operator control-plane audit for the public sales expert.
-- Relationships are application-managed soft references by design.
CREATE TABLE public_expert_control_audit (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    page_id UUID NOT NULL,
    release_id UUID,
    actor_user_id UUID NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('page', 'workspace', 'platform')),
    action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
    prior_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    page_version INTEGER NOT NULL CHECK (page_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(prior_state) = 'object'),
    CHECK (jsonb_typeof(new_state) = 'object')
);
