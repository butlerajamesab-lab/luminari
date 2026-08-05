-- Production migration-ledger receipt for the source-controlled implementation
-- in 20260805233000_prism_rosetta_v21_version_state.sql.
--
-- Intentionally a no-op on fresh replay: the governed Prism 2.1 queue and
-- legislative-version state implementation is applied once by the later source migration.
select 1;
