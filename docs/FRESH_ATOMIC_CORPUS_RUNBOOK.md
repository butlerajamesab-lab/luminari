# Fresh Atomic Corpus Runbook

1. Apply/verify the additive atomic substrate migration.
2. Queue exactly one `fresh_atomic_corpus_v1.0.0` run with scope naming the two authoritative Storage buckets.
3. Deploy code containing the parser/startup resume hook.
4. The service resumes only an explicitly queued/running run; it never creates work on boot.
5. Process current Storage bytes in bounded artifact batches.
6. SQL files are parsed as text (`COPY` rows / `INSERT VALUES` tuples) and are never executed.
7. ZIP members are parsed independently and retain member paths.
8. Exact Storage duplicates are not selected for independent processing; provenance remains represented at the source-artifact layer.
9. Finalize with a content-addressed run receipt and report both deduplicated atomic record count and source-origin count.
10. Compare extraction counts to historical coverage oracles, but do not promote historical rows as canonical simply to hit a number.
11. Typed derivation, identity resolution, and public publication remain separate subsequent gates.
