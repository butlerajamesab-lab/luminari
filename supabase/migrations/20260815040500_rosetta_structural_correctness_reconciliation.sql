begin;

-- Historical ownership-retirement marker.
--
-- This migration version was originally used as the source file for Rosetta
-- structural reconciliation work that was applied to the separate Rosetta
-- production database. Civic Genome/Luminari does not own Rosetta's
-- decomposition schema, producer, reconciliation, validation, or publication
-- semantics.
--
-- The migration version remains in this repository only because Luminari's
-- immutable migration-ledger parity contract records the historical version.
-- The Rosetta-owned prerequisite schema now lives in the Rosetta repository at
-- its actual Rosetta production ledger versions (20260815041013 and
-- 20260815041426). No Rosetta DDL is executed here.

commit;
