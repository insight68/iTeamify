-- Refuse to reserve the new lead route if it would hide an existing workspace.
-- Resolve any collision explicitly before retrying; never rename user data here.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM workspace WHERE lower(slug) = 'leads') THEN
        RAISE EXCEPTION 'Cannot reserve leads route: an existing workspace uses slug leads';
    END IF;
END
$$;
