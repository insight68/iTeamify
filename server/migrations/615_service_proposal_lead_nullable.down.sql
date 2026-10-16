-- Reverting re-imposes the requirement, so the rollback only succeeds while
-- every remaining proposal still has a lead. A proposal created for an
-- account-scoped deal has none by construction and cannot be given one, so the
-- statement fails loudly (SQLSTATE 23502) rather than silently inventing a
-- value. That is the intended behaviour: the precondition of the old schema is
-- what has been lost, and the operator must decide what to do with those rows.
ALTER TABLE service_proposal ALTER COLUMN lead_id SET NOT NULL;
