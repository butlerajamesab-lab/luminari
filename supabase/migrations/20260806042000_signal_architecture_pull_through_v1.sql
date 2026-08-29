-- Production replay alias no-op receipt.
-- The canonical production implementation is 20260806043149_signal_architecture_pull_through_v1.sql and must execute exactly once.
-- This ledger version is retained as a valid, explicit no-op for fresh replay.
select 1;
