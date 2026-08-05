-- Production migration-ledger receipt for the source-controlled implementation
-- in 20260805210100_legislative_version_spine_auto_registration.sql.
--
-- Intentionally a no-op on fresh replay: the automatic Docket/Genome triggers
-- are installed once by the earlier source migration.
select 1;
