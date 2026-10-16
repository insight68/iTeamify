CREATE TABLE contract_review_action (
    review_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    request_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    actor_id UUID NOT NULL,
    action TEXT NOT NULL,
    note TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
