-- Stable customer data is account-owned after conversion. Lead remains the
-- acquisition record and is optional for directly-created customer deals.
ALTER TABLE accounts
    ADD COLUMN company_name TEXT,
    ADD COLUMN market_language TEXT,
    ADD CONSTRAINT accounts_merge_target_check CHECK (
        (record_status = 'merged') = (merged_into_account_id IS NOT NULL)
        AND merged_into_account_id IS DISTINCT FROM id
    ),
    ADD CONSTRAINT accounts_override_reason_required CHECK (
        score_override IS NULL OR score_override_reason IS NOT NULL
    );

ALTER TABLE account_contacts
    ADD COLUMN buying_role TEXT NOT NULL DEFAULT 'unknown'
        CHECK (buying_role IN ('decision_maker', 'influencer', 'user', 'gatekeeper', 'unknown'));

ALTER TABLE account_identities ADD CONSTRAINT account_identity_value_nonempty
    CHECK (length(trim(normalized_value)) > 0);

ALTER TABLE lead_opportunity ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE service_engagement ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE lead_assessment ALTER COLUMN lead_id DROP NOT NULL;

UPDATE accounts a SET company_name = l.company_name, market_language = l.market_language
FROM leads l WHERE l.id = a.id AND l.account_id = a.id AND l.workspace_id = a.workspace_id;
UPDATE account_contacts a SET buying_role = c.buying_role
FROM lead_contacts c WHERE c.id = a.id AND c.workspace_id = a.workspace_id;

ALTER TABLE leads ADD CONSTRAINT leads_conversion_state_check CHECK (
    (conversion_status IN ('linked', 'converted') AND account_id IS NOT NULL AND converted_at IS NOT NULL)
    OR (conversion_status IN ('pending', 'disqualified', 'merged') AND account_id IS NULL
        AND converted_at IS NULL AND converted_by_member_id IS NULL)
);
