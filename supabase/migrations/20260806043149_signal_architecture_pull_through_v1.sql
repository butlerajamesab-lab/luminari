-- Production-ledger receipt for the source-controlled signal architecture
-- pull-through migration. The replayable implementation is preserved in
-- 20260806042000_signal_architecture_pull_through_v1.sql.
--
-- Supabase assigned live ledger version 20260806043149 when the exact source
-- migration was applied through the connected migration API. This file is an
-- intentional no-op on fresh replay so the implementation is not applied twice.
select 1;
