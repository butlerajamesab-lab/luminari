# Genome expired legacy queue lease retirement — executed

**Production status: APPLIED. DO NOT REPLAY.** Lighthouse Supabase project `wepxlinwbjrkqdzkqpar`, 2026-10-17.

Executed exact reviewed SQL `supabase/migration_sources/retire_expired_genome_legacy_leases_20261017_PREPARED.sql`, Git blob `89061870ddba4c9c492b11de9e7e906036e6b9e4`, via guarded DML `execute_sql` in a single committed transaction. No migration-ledger identity was assigned.

Prerequisite verified before execution: permanent obsolete Genome conveyor retirement PR #743 merged at `5a8b61ddea5dd0722e93b9f1c6cbce87efb21fda`; Render Lighthouse web and Lighthouse Prism canary both LIVE on that exact commit, preceding instances deactivated. The old V2.5.39 Rosetta campaign worker was already suspended.

The transaction verified original 20-row identity/full-row SHA-256 and bound old-engine statuses, retired exactly 20 submitted/eligible locked queues to terminal `permanent_failure` with reason `retired_legacy_generation`, cleared locks, and preserved Docket/version/queue counts. Independent post-commit readback showed **0** active old leases, **20** retired old lease markers, **9,428** old queue rows unchanged in population before final purge, and **38,498** Docket source documents.

Final receipt retirement subsequently removed those exact old queues. **Do not reapply this lease SQL or interpret the original `PREPARED` filename as a pending task.**
