-- Surface the delete audit tuple on the customer read model.
--
-- Why this is worth a view rewrite rather than a second, view-free query for the
-- deleted lane: the partial index added in migration 612
-- (idx_leads_workspace_deleted, WHERE record_status = 'deleted') is reachable
-- *through the view*. Postgres pushes the constant `record_status` predicate
-- into the UNION ALL branches, so the leads branch becomes an index scan on the
-- partial index and the accounts branch collapses to a filter that matches
-- nothing (accounts.record_status cannot be 'deleted' -- its CHECK in migration
-- 565 admits only active/archived/merged). Measured on a 30k-row seed:
--   via view:    Index Scan using idx_leads_workspace_deleted, 0.18 ms
--   direct leads: Index Scan + Incremental Sort,             0.07 ms
-- The 0.11 ms difference buys one shared row type for both lanes, which keeps
-- the service, the sqlc model, and the API response identical across scopes.
--
-- CREATE OR REPLACE VIEW can only append columns, so the four new ones go last
-- and every existing column keeps its name, type, and position.
--
-- The accounts branch emits typed NULLs: v1 refuses to delete a converted
-- customer, so an account row can never carry a delete tuple. When the v2
-- cancellation flow gives accounts real columns, this branch swaps its NULLs
-- for them and nothing else changes.
CREATE OR REPLACE VIEW crm_customer_records AS
SELECT a.id, a.workspace_id, 'account'::text AS record_type, a.id AS account_id,
 NULL::uuid AS lead_id, 'approved'::text AS review_status,
 a.account_type AS lead_type, a.domain, a.website_url,
 '[]'::jsonb AS emails, '[]'::jsonb AS phones,
 a.display_name,
 a.company_name,
 a.country,
 a.industry,
 a.priority,
 a.notes,
 a.tags,
 a.custom_fields,
 a.first_contact_at,
 a.last_contact_at,
 a.next_follow_up_at,
 a.primary_opportunity_id,
 a.score_override,
 a.score_override_reason,
 a.score_override_by_member_id,
 a.score_override_at,
 a.score_override_expires_at,
 a.parked_at,
 a.park_reason,
 a.park_source,
 a.parked_by_member_id,
 a.record_status,
 a.owner_member_id,
 a.version,
 a.created_at,
 a.updated_at,
 NULL::timestamptz AS deleted_at,
 NULL::text AS delete_reason,
 NULL::text AS delete_source,
 NULL::uuid AS deleted_by_member_id
FROM accounts a
UNION ALL
SELECT l.id,l.workspace_id,'lead'::text,NULL::uuid,l.id,l.review_status,
 l.lead_type,COALESCE(l.domain,''),l.website_url,l.emails,l.phones,
 l.display_name,
 l.company_name,
 l.country,
 l.industry,
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
 l.record_status,
 l.owner_member_id,
 l.version,
 l.created_at,
 l.updated_at,
 l.deleted_at,
 l.delete_reason,
 l.delete_source,
 l.deleted_by_member_id
FROM leads l WHERE l.account_id IS NULL;
