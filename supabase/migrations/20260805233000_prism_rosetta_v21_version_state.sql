-- Production replay alias no-op receipt.
-- The canonical production implementation is 20260805215620_prism_rosetta_v21_version_state.sql and must execute exactly once.
-- This ledger version is retained as a valid, explicit no-op for fresh replay.
select 1;
