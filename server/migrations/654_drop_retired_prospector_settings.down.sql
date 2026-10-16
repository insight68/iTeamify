-- Configuration deletion is intentionally irreversible.
DO $$
BEGIN
    RAISE EXCEPTION 'retired prospecting settings cannot be restored';
END;
$$;
