-- Ledger reconciliation for an already-applied production migration.
-- Historical SQL remains authoritative in supabase_migrations.schema_migrations.
-- Intentionally not replayed to avoid duplicating queue-side effects.
select 1;
