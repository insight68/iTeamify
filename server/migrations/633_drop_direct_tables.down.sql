DO $$ BEGIN
    RAISE EXCEPTION 'multiple direct sessions cannot be downgraded to one conversation per pair; restore a verified pre-migration backup instead';
END $$;
