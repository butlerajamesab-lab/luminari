# Rosetta publication batch: 25 verified queue executions

The fixed 25-row batch had completed by 20:03:01 UTC on September 13, 2026. Every selected job made one successful HTTP 201 submission and persisted one authoritative Prism 2.4 receipt. Readback was recorded at 20:03:48 UTC.

| Check | Observed result |
| --- | --- |
| Selected queue jobs / distinct requests / receipts | 25 / 25 / 25 |
| Attempts / retries / failed jobs | 25 / 0 / 0 |
| Current Rosetta publication and source preflight | All 25 passed, including source text rehash and five provenance hashes |
| Request, binding, and receipt integrity | All 25 matched; output hashes and replay keys were independently recomputed |
| Runtime budget | Exactly 25 claims and completions; exhaustion logged at 20:03:07 UTC |
| New Prism 2.4 runs outside the selected scope at readback | 0 |
| Existing terminal queue rows | All 15 unchanged; before/after fingerprint `c3051c6c488cdbea54b5593cac02028f` |

All 25 overall receipts classify their source-bound assertions as `contradicted`: 42 findings concern `declared_section_matches_source`, and one concerns `override_exception_marker_present`. The projection retained all seven earlier pattern rows and appended seven successors that pass the installed receipt and prior-coverage guards. Six modal reassessments are recorded as `supported_one_source`; the override pattern remains `contradicted`.

Those guards do not establish that the modal interpretation is correct. Subsequent inspection reproduced an upstream Prism 2.4 defect: its case-insensitive token matcher treats the month in `May 28, 1880` and `May 11, 2026` as the modal verb `may`. The corresponding supported successors `91955a17-ecef-483b-b2b6-0fffee738cf6` and `e6f0c3b6-8f1c-41fe-9c82-60afd046f122` are semantically unsupported. A third receipt mistakes a `Date Introduced: May 29, 2026` header for modal evidence without creating a pattern successor. The JSON records all three exact spans and receipt IDs. The subsequent [Prism 2.5 live correction](2026-09-13-prism-v25-live-correction.md) records the completed immutable replay and forward repair; these historical receipts remain evidence of the defective behavior.

The runtime used an explicit 25-UUID allowlist, no single canary, and a process allowance of 25. It ran commit [01dd5775](https://github.com/butlerajamesab-lab/luminari/commit/01dd5775d5e784bd8ab22b2a68d41c5c1614a22c), deployed as `dep-dajg0dfqj5pc73dg1eag`. [PR #651](https://github.com/butlerajamesab-lab/luminari/pull/651) repaired budget charging and added bounded selection. The first activation exposed the dedicated entrypoint's canary-only guard before any selected job ran. [PR #653](https://github.com/butlerajamesab-lab/luminari/pull/653) shared selection validation with that entrypoint and added 11 actual-entrypoint startup/shutdown tests. Its full check passed 1,936 tests, TypeScript, build, and health checks; the bridge passed 161 tests.

The [machine-readable receipt](2026-09-13-prism-publication-batch-25.json) records the exact queue/request/receipt/run identities, source hashes, preflight decisions, HTTP attempts, outcomes, deployment history, budget event, terminal fingerprint method, projection lineage, and reproduced semantic limitation. SHA-256: `399f8c0c387f22567b56e1eaf3026772c4485d656d585e9eee194b5e60f5747e`. The [second batch receipt](2026-09-13-prism-publication-batch-02.md) records another 25 executions under a disjoint fixed selection.
