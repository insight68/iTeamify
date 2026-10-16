-- Structured service quotes created from Chat, their immutable line items,
-- and the order produced when a buyer confirms a quote.
--
-- Relationships are application-managed soft references. No FOREIGN KEY or
-- cascading action is used. Secondary and unique indexes are created in the
-- following single-statement CONCURRENTLY migrations.

CREATE TABLE service_quote (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    chat_session_id UUID NOT NULL,
    source_task_id UUID NOT NULL,
    quote_no TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'accepted', 'superseded', 'revoked', 'expired')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor > 0),
    discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    total_minor BIGINT NOT NULL CHECK (total_minor > 0),
    delivery_terms TEXT NOT NULL DEFAULT '',
    commercial_terms TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL,
    supersedes_quote_id UUID,
    public_link_version INTEGER NOT NULL DEFAULT 1 CHECK (public_link_version > 0),
    created_by_actor_type TEXT NOT NULL CHECK (created_by_actor_type IN ('agent', 'member')),
    created_by_actor_id UUID,
    revoked_by_user_id UUID,
    revoked_reason TEXT,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (subtotal_minor - discount_minor = total_minor)
);

CREATE TABLE service_quote_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    quote_id UUID NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_label TEXT NOT NULL DEFAULT '',
    unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
    line_total_minor BIGINT NOT NULL CHECK (line_total_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    quote_id UUID NOT NULL,
    chat_session_id UUID NOT NULL,
    order_no TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'cancelled', 'fulfilled')),
    settlement_status TEXT NOT NULL DEFAULT 'not_collected'
        CHECK (settlement_status IN ('not_collected')),
    buyer_type TEXT NOT NULL CHECK (buyer_type IN ('user', 'guest')),
    buyer_user_id UUID,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT,
    buyer_phone TEXT,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    total_minor BIGINT NOT NULL CHECK (total_minor > 0),
    quote_snapshot JSONB NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (buyer_type = 'user' AND buyer_user_id IS NOT NULL)
        OR (buyer_type = 'guest' AND buyer_user_id IS NULL)
    ),
    CHECK (buyer_type = 'user' OR buyer_email IS NOT NULL OR buyer_phone IS NOT NULL)
);
