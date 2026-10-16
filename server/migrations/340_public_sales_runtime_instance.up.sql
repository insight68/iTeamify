CREATE TABLE public_sales_runtime_instance (
    instance_id UUID NOT NULL,
    runtime_version TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    model TEXT NOT NULL,
    egress_healthy BOOLEAN NOT NULL DEFAULT false,
    egress_checked_at TIMESTAMPTZ,
    last_error_code TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(runtime_version) BETWEEN 1 AND 100),
    CHECK (length(profile_version) BETWEEN 1 AND 100),
    CHECK (length(model) BETWEEN 1 AND 200),
    CHECK (last_error_code IN ('', 'model_egress_unavailable'))
);
