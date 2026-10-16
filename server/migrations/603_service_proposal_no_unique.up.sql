-- proposal_no is generated as P-YYYYMMDD-<ulid prefix>, which is unique in
-- practice but not by construction. Scope the guarantee to the workspace the
-- same way service_quote does not, deliberately: numbers are shown to
-- customers, so a duplicate inside one workspace would be visible.
CREATE UNIQUE INDEX CONCURRENTLY uq_service_proposal_no
    ON service_proposal (workspace_id, proposal_no);
