-- Ledger reconciliation note for legacy May 17 migration versions.
--
-- Production already records the two timestamped unified civic infrastructure
-- projection versions. The remaining legacy short version belongs to the
-- documentation-only CivicMap loader note and must be renamed in the migration
-- ledger from 20260517 to 20260517000000 before this branch is merged.
--
-- This file intentionally performs no schema_migrations mutation because
-- Supabase migration files must not rewrite their own migration ledger.

select 1;
