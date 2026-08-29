-- Production replay alias no-op receipt.
-- The canonical production implementation is 20260805210717_legislative_version_decomposition_spine.sql and must execute exactly once.
-- This ledger version is retained as a valid, explicit no-op for fresh replay.
select 1;
