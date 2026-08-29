-- Production replay alias no-op receipt.
-- The canonical production implementation is 20260805210822_legislative_version_lineage_binding_fix.sql and must execute exactly once.
-- This ledger version is retained as a valid, explicit no-op for fresh replay.
select 1;
