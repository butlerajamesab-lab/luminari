-- Production migration-ledger receipt for the source-controlled implementation
-- in 20260805210050_legislative_version_lineage_binding_fix.sql.
--
-- Intentionally a no-op on fresh replay: the explicit Genome-identity lineage
-- correction is applied once by the earlier source migration.
select 1;
