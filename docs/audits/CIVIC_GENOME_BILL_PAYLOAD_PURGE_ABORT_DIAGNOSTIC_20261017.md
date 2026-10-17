# Current bill-payload retirement — aborted production attempt and diagnostic-only correction

Status: **NOT APPLIED**. This is a failure record, not a production cleanup receipt or authorization for retry.

## Exact attempted operation

The already-reviewed, pinned 24,748-character SQL from PR #735 was submitted to Lighthouse Supabase via `apply_migration`, using proposed name `purge_disqualified_genome_bill_payloads_20261017`. The server rejected the DO transaction at its six-surface post-update conservation assertion:

```
ERROR: P0001: protected source/version/event/history metadata conservation failed
CONTEXT: PL/pgSQL function inline_code_block line 111 at RAISE
```

No successful migration identity/version was assigned. A new claim of applied SQL or completed cleanup would be false.

## Independent rollback readback

Fresh Lighthouse SQL after the rejected application showed:

| Measure | Readback |
|---|---:|
| Traits | 0 |
| Current bills with old assembly, receipt or run ID | 3,082 |
| Version receipts bearing `rosetta_engine_version` | 9,428 |
| Sealed projection snapshots bearing `rosetta_assembly` | 104,741 |
| Successful `purge_disqualified_genome_bill_payloads_20261017` ledger entries | 0 |

All three `civic_genome_bill` application triggers remained enabled.

The prepared source's current full-row hash `9ceb049cd1d9575952d1a13fbeea4a52280d149d2c63c6ec5e30dff1ebbdd988` and expected source-only hash `f3e2f74463124a6f4a98958dd5a32d49560e33a065c25c439a232109e1f7ebab` were both recomputed before submission and matched. All 3,082 target rows had both old JSON keys and a non-NULL run ID; the six old engine categories matched the prepared trigger allowance.

## Why the guard must remain

The failed assertion compares count plus two-seed metadata fingerprints across bill, version, family, Docket cache, event and historical projection surfaces. A generic exception is insufficient to distinguish:

1. Legitimate concurrent changes to another surface between the two observations.
2. A storage-representation-only change (e.g. `pg_column_size` of a logically conserved JSONB field).
3. Actual collateral DML from an unexpected trigger or other code.

These remain *hypotheses*, not an identified root cause.

## Narrow diagnostic change

Only the failure branch now includes the before/after fingerprint for each unequal protected surface in PostgreSQL error DETAIL. No guard is removed, no accepted identity/count changes, no new write path, no production SQL migration file, and no deployment/promotion result.

The fixture injects a forbidden event write and requires error DETAIL to identify `public.civic_genome_event`. This validates diagnostic discrimination while preserving rollback. CI still must pass on the new head.

## Next execution boundary

Do not retry in production merely because this diagnostic patch merged. First obtain a passing disposable PostgreSQL job and independently review the specific observed surface difference. If a production diagnostic attempt is authorized, apply only the exact reviewed source, inspect the failure DETAIL (or full success and source-preserving readback), and archive any successfully executed SQL under the actual Supabase-assigned migration version.

Rosetta V12 remains selected. V13 is unpromoted. Viewfinder, Atlas signals, source intake, and original source records are outside this corrective change.
