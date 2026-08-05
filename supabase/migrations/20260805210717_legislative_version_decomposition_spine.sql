-- Production migration-ledger receipt for the source-controlled implementation
-- in 20260805210000_legislative_version_decomposition_spine.sql.
--
-- Intentionally a no-op on fresh replay: the complete deterministic substrate
-- is applied once by the earlier source migration.
select 1;
