-- Runtime support changes with the server release and is already validated by
-- agent.SupportsCustomCommand at the write boundary and again by the daemon
-- before launch. Keeping that release-owned catalog in a database whitelist
-- forced a schema migration for every new backend and left the constraint
-- permanently NOT VALID to tolerate historical rows.
--
-- The database continues to enforce the stable storage invariant: protocol
-- families are bounded lowercase identifiers. The supported set remains the
-- application's versioned contract.
ALTER TABLE runtime_profile
    DROP CONSTRAINT IF EXISTS runtime_profile_protocol_family_check;

ALTER TABLE runtime_profile
    ADD CONSTRAINT runtime_profile_protocol_family_shape_check
    CHECK (
        char_length(protocol_family) BETWEEN 1 AND 64
        AND protocol_family ~ '^[a-z][a-z0-9_-]*$'
    ) NOT VALID;

ALTER TABLE runtime_profile
    VALIDATE CONSTRAINT runtime_profile_protocol_family_shape_check;
