# Legacy unversioned migration sources

These SQL files were previously stored in `supabase/migrations/` with filename prefixes that were not exact 14-digit Supabase migration versions.

They are preserved byte-for-byte as historical source evidence, but they are not executable migrations. Supabase development branches clone the production schema and then attempt to apply local migration files absent from the production ledger. Keeping these files in the executable lane caused already-applied DDL to replay, including duplicate trigger creation.

Rules:

- Do not move these files back into `supabase/migrations/`.
- Do not assign synthetic versions and replay them.
- If a historical object requires repair, create a new idempotent 14-digit migration after the current production head.
- Preserve these files for provenance, audit, and reconstruction only.

Archived on 2026-08-02 after fresh branch acceptance exposed `20260521_crosswalk_enrichment_trigger.sql` replaying against an already-existing production-cloned trigger.
