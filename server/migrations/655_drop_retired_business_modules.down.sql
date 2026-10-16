-- Retired business data and schemas are intentionally not restored.
DO $$
BEGIN
    RAISE EXCEPTION 'retired business modules cannot be restored';
END;
$$;
