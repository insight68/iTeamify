-- One account per approved lead. Account id equals lead id so existing customer
-- URLs and lead_id foreign references keep working after the split.

INSERT INTO accounts (
    id, workspace_id, account_type, display_name, domain, website_url, country,
    industry, city, region, customer_since, owner_member_id, priority, notes,
    tags, custom_fields, first_contact_at, last_contact_at, next_follow_up_at,
    primary_opportunity_id, score_override, score_override_reason,
    score_override_by_member_id, score_override_at, score_override_expires_at,
    parked_at, park_reason, park_source, parked_by_member_id, created_at, updated_at
)
SELECT
    l.id,
    l.workspace_id,
    l.lead_type,
    l.display_name,
    COALESCE(l.domain, ''),
    l.website_url,
    l.country,
    l.industry,
    l.city,
    l.region,
    COALESCE(l.reviewed_at, l.created_at),
    l.owner_member_id,
    l.priority,
    l.notes,
    l.tags,
    l.custom_fields,
    l.first_contact_at,
    l.last_contact_at,
    l.next_follow_up_at,
    l.primary_opportunity_id,
    l.score_override,
    l.score_override_reason,
    l.score_override_by_member_id,
    l.score_override_at,
    l.score_override_expires_at,
    l.parked_at,
    l.park_reason,
    l.park_source,
    l.parked_by_member_id,
    l.created_at,
    l.updated_at
FROM leads l
WHERE l.record_status = 'active'
  AND l.review_status = 'approved'
  AND l.account_id IS NULL;

UPDATE leads l
SET account_id = l.id,
    conversion_status = 'converted',
    converted_at = COALESCE(l.reviewed_at, l.created_at)
WHERE l.record_status = 'active'
  AND l.review_status = 'approved'
  AND l.account_id IS NULL;

INSERT INTO account_contacts (
    id, workspace_id, account_id, full_name, job_title, email, email_normalized,
    phone, phone_e164, whatsapp, linkedin_url, is_primary, created_at, updated_at
)
SELECT
    c.id, c.workspace_id, l.account_id, c.full_name, c.job_title, c.email,
    c.email_normalized, c.phone, c.phone_e164, c.whatsapp, c.linkedin_url,
    c.is_primary, c.created_at, c.updated_at
FROM lead_contacts c
JOIN leads l ON l.id = c.lead_id AND l.workspace_id = c.workspace_id
WHERE l.account_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO account_identities (
    id, workspace_id, account_id, identity_type, normalized_value, created_at
)
SELECT
    i.id, i.workspace_id, l.account_id, i.identity_type, i.normalized_value, i.created_at
FROM lead_identities i
JOIN leads l ON l.id = i.lead_id AND l.workspace_id = i.workspace_id
WHERE l.account_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO account_activities (
    id, workspace_id, account_id, originating_lead_id, activity_type, body, data,
    actor_type, actor_id, task_id, chat_session_id, chat_message_id,
    public_expert_session_id, occurred_at, created_at
)
SELECT
    a.id, a.workspace_id, l.account_id, l.id, a.activity_type, a.body, a.data,
    a.actor_type, a.actor_id, a.task_id, a.chat_session_id, a.chat_message_id,
    a.public_expert_session_id, a.occurred_at, a.created_at
FROM lead_activities a
JOIN leads l ON l.id = a.lead_id AND l.workspace_id = a.workspace_id
WHERE l.account_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

UPDATE lead_opportunity o
SET account_id = l.account_id
FROM leads l
WHERE l.id = o.lead_id
  AND l.workspace_id = o.workspace_id
  AND l.account_id IS NOT NULL
  AND o.account_id IS NULL;

UPDATE lead_assessment a
SET account_id = l.account_id
FROM leads l
WHERE l.id = a.lead_id
  AND l.workspace_id = a.workspace_id
  AND l.account_id IS NOT NULL
  AND a.account_id IS NULL;

UPDATE service_quote q
SET account_id = l.account_id
FROM leads l
WHERE l.id = q.lead_id
  AND l.workspace_id = q.workspace_id
  AND l.account_id IS NOT NULL
  AND q.account_id IS NULL;

UPDATE service_order o
SET account_id = l.account_id
FROM leads l
WHERE l.id = o.lead_id
  AND l.workspace_id = o.workspace_id
  AND l.account_id IS NOT NULL
  AND o.account_id IS NULL;

UPDATE service_engagement e
SET account_id = l.account_id
FROM leads l
WHERE l.id = e.lead_id
  AND l.workspace_id = e.workspace_id
  AND l.account_id IS NOT NULL
  AND e.account_id IS NULL;

UPDATE outbound_email e
SET account_id = l.account_id
FROM leads l
WHERE l.id = e.lead_id
  AND l.workspace_id = e.workspace_id
  AND l.account_id IS NOT NULL
  AND e.account_id IS NULL;

UPDATE accounts a
SET pool_company_id = substring(s.source_key from 9)::uuid
FROM lead_sources s
JOIN leads l ON l.id = s.lead_id AND l.workspace_id = s.workspace_id
WHERE s.source_type = 'customer_pool'
  AND s.source_key ~ '^company:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND a.id = l.account_id
  AND a.pool_company_id IS NULL;
