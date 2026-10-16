-- Account-native opportunities may have no source lead; do not invent one or
-- delete business history merely to restore the former NOT NULL constraint.
ALTER TABLE leads DROP CONSTRAINT leads_conversion_state_check;
ALTER TABLE account_identities DROP CONSTRAINT account_identity_value_nonempty;
ALTER TABLE account_contacts DROP COLUMN buying_role;
ALTER TABLE accounts DROP CONSTRAINT accounts_merge_target_check,
    DROP CONSTRAINT accounts_override_reason_required,
    DROP COLUMN company_name, DROP COLUMN market_language;
