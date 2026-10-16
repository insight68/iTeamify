# Database baseline

This directory initializes the current iTeamify schema. The former 702-step
history through `662_workspace_openagent_config_primary_key` was squashed for
the new project; retired tables, columns, indexes, and historical data backfills
are no longer created and then removed.

Apply with `make migrate-up`. The baseline contains:

- `001_init`: extensions, 116 tables, checks, functions, and triggers.
- `002`–`382`: 381 indexes, each built by one standalone
  `CREATE [UNIQUE] INDEX CONCURRENTLY` statement.
- `383_constraints`: attach primary-key and unique constraints to the existing
  indexes with `USING INDEX`; this does not build additional indexes.
- `384_seed`: installation defaults for billing, the hourly rollup watermark,
  and token credit rates.

Relationships and dependent cleanup belong to the application. The baseline
does not install the former database foreign keys or cascading actions.
Primary keys, unique constraints, checks, partial indexes, expression indexes,
and `NULLS NOT DISTINCT` semantics are retained.

`make migrate-down` reverses the baseline and removes its tables and functions.
The shared `pgcrypto` and `pg_trgm` extensions remain installed.

## Existing databases

Use this baseline with an empty database. A database that recorded the old
history is not an in-place upgrade target: the runner deliberately rejects its
unknown versions or differing checksums. Do not bypass that protection by
deleting `schema_migrations` or changing its checksums; the application tables
would still exist and would not match this initialization sequence.

Keep an existing database intact and point development at a new empty database.
If its data must be retained, back it up and plan an explicit data transfer.
The migration squash itself does not reset or modify any existing database.

An error such as `unknown migration "002_agent_config"` during `make dev`
means the configured database still records the former history. For a local
database that must retain its data, prepare a separate database with this
baseline, restore application data while retaining the new migration ledger,
and compare every table's row count and content digest. Verify columns,
indexes, checks, functions, and triggers as well. Only perform the final
database-name switch after the user has authorized that operation. Retain the
original database and complete dump until validation succeeds; remove them
afterwards only when explicitly requested. Do not make the normal migration
runner silently accept the old history.

## Future migrations

Start at `385` and use one unique numeric prefix per migration pair. Every
version needs both `.up.sql` and `.down.sql`. Applied migrations are immutable;
make subsequent changes in new migrations. Keep concurrent index creation in
its own single-statement file, including indexes on new tables.
