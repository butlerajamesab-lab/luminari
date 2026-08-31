# Rosetta migration deployment branch

This branch is the source-controlled migration ledger for the standalone
ROSETTA Supabase project. It must not be used to migrate Lighthouse.

## Binding

- Parent project: `kjzytnzkkdpdxtqtjlew` (ROSETTA)
- Preview project: `fqmgxoicohsvntceslxu`
- Git branch: `repair/rosetta-v2513-ledger-reconstruction-20260830`
- Recovered ledger: the complete SQL statement bodies recorded by the
  preview database, not timestamp-only placeholders

## Gate

A Rosetta production migration or corpus campaign may start only after the
Supabase preview workflow reports `MIGRATIONS_APPLIED` or a later successful
state for this exact branch head. Lighthouse migrations remain on `main` and
must never be copied into this branch's `supabase/migrations` directory.
