-- Historical reconciliation record.
--
-- The provenance and Atlas/Lighthouse bridge objects represented by the
-- original migration already exist in the protected Lighthouse database.
-- Several of those live objects have since evolved independently, including
-- public.atlas_lighthouse_resource_bridge_v1 and
-- public.atlas_lighthouse_signal_bridge_v1.
--
-- Replaying the original CREATE TABLE IF NOT EXISTS statements against those
-- evolved tables skipped table creation and then attempted indexes and foreign
-- keys against columns that are not part of the live schemas, causing protected
-- branch migration application to fail at idx_bridge_run.
--
-- This file intentionally performs no DDL or data mutation. The existing
-- production objects are authoritative for this historical checkpoint.
--
-- Version normalized from legacy 20260501 to 20260501000000 so Supabase's
-- migration-history comparison recognizes it consistently.

select 1;
