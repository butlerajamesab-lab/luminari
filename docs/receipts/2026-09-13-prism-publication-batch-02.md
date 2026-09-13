# Rosetta publication batch 2: 25 further queue executions

The second fixed batch completed by 20:14:51 UTC on September 13, 2026. Its 25 queue IDs are disjoint from the first batch. The dedicated worker started at 20:10:47 with that exact allowlist, no single canary, and allowance 25. Readback was recorded at 20:17:17 UTC.

| Check | Observed result |
| --- | --- |
| Selected queue jobs / distinct requests / receipts | 25 / 25 / 25 |
| HTTP 201 attempts / retries / failed jobs | 25 / 0 / 0 |
| Immediate Rosetta publication, five provenance hashes, source text rehash | All 25 passed |
| Request identity, output hash, and replay key recomputation | All 25 matched |
| Installed complete-receipt guard | All 25 passed |
| Runtime budget | 25 claims, 25 completions, exhaustion at 20:14:57 |
| New Prism 2.4 runs outside the selected scope at readback | 0 |
| Existing terminal queue rows | All 15 unchanged; fingerprint `c3051c6c488cdbea54b5593cac02028f` |

All 25 overall receipts are `contradicted`, recording 45 `declared_section_matches_source` findings. The four earlier modal-pattern rows remain in history with only `is_current` changed. Four supported successors pass the installed receipt, identity, and prior-coverage guards. These four successor spans are separate from the month-token defect below.

Inspection also reproduced the existing Prism 2.4 month-token defect in three steps across two receipts: `Committee Report May 5, 2026`, `Introduced May 5, 2026`, and `Read the first time May 5, 2026`. The only matched modal token in each span is the calendar month. These receipts created no supported pattern successor. The [first batch](2026-09-13-prism-publication-batch-25.md) contains two semantically unsupported successors caused by the same defect. At that readback, new cohort activation remained paused. The subsequent [Prism 2.5 live correction](2026-09-13-prism-v25-live-correction.md) records the completed immutable replay of all five affected receipts and the two forward pattern corrections.

Execution used commit [fffafb4c](https://github.com/butlerajamesab-lab/luminari/commit/fffafb4c872968be2d0d88e72996c40cdc5a8bef), whose runtime matches combined fix commit `01dd5775`; its extra change is documentation. Render deployment `dep-dajg609594qs73c378og` became live at 20:10:43. Both entrypoint and queue startup logs matched all 25 IDs. Existing timeout and circuit settings remained 15 seconds, one failure, and 15 minutes.

The [machine-readable receipt](2026-09-13-prism-publication-batch-02.json) contains exact selections, preflight, provenance, attempts, receipts, pattern lineage, and the reproduced date-token cases. SHA-256: `94e8328c5d197f2e222c078ceff763365e171dd3440b02a4340702f7a47f1a90`.
