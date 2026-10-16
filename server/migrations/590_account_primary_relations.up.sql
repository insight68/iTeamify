-- Preserve the explicit account selection. Recover a missing selection from an
-- existing primary opportunity, then make the redundant primary flag agree.
WITH selections AS (
    SELECT a.workspace_id, a.id,
        COALESCE(
            (SELECT o.id FROM lead_opportunity o WHERE o.workspace_id=a.workspace_id AND o.account_id=a.id AND o.id=a.primary_opportunity_id),
            (SELECT o.id FROM lead_opportunity o WHERE o.workspace_id=a.workspace_id AND o.account_id=a.id AND o.is_primary ORDER BY o.updated_at DESC,o.id LIMIT 1)
        ) AS opportunity_id
    FROM accounts a
)
UPDATE accounts a SET primary_opportunity_id=s.opportunity_id
FROM selections s WHERE a.id=s.id AND a.workspace_id=s.workspace_id
AND a.primary_opportunity_id IS DISTINCT FROM s.opportunity_id;

UPDATE lead_opportunity o SET is_primary=(o.id IS NOT DISTINCT FROM a.primary_opportunity_id)
FROM accounts a WHERE o.account_id=a.id AND o.workspace_id=a.workspace_id
AND o.is_primary IS DISTINCT FROM (o.id IS NOT DISTINCT FROM a.primary_opportunity_id);

WITH ranked AS (
    SELECT id,row_number() OVER (PARTITION BY workspace_id,account_id ORDER BY created_at,id) AS position
    FROM account_contacts WHERE is_primary
)
UPDATE account_contacts c SET is_primary=false FROM ranked r WHERE c.id=r.id AND r.position>1;
