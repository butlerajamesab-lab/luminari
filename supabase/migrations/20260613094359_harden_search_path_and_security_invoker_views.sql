-- Ledger reconciliation for an already-applied production migration.
-- Historical SQL remains authoritative in supabase_migrations.schema_migrations.
-- Intentionally not replayed during history repair.
select 1;
