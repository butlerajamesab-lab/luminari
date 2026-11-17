# HB349 PN4024: candidate one-bill Docket metadata refresh

Status: isolated source-only **candidate**. NOT deployed, executed against LegiScan, or approved for production. Never treats metadata as source-byte provenance, typography proof, semantic certification, or publication authorization.

## Read-only evidence, 2026-11-17

- Official PA General Assembly session 2025-26 bill HB349: print PN0304 (2025-01-27), PN3943 (2026-09-29), PN4024 (2026-10-07); PN4024 passed House 2026-10-19, referred to Senate Law & Justice, not enacted. Source: https://www.palegis.us/legislation/bills/2025/HB349
- Official latest print URL: https://www.palegis.us/legislation/bills/text/PDF/2025/0/HB0349/PN4024 (official file bytes **not acquired or hashed** by this candidate).
- `public.docket_bill_detail_cache` for LegiScan `bill_id=1940853`: `state=PA`, `session_id=2192`, `bill_number=HB349`; `fetched_at=2026-09-30 02:01:55.381689+00`; `texts` has only `doc_id=3084350` / PN0304 and `doc_id=3460740` / PN3943. Existing cache is from BEFORE PN4024 was issued.
- `public.civic_genome_bill_version` has two related texts; no bound Rosetta, assembly or Prism receipts.
- Live database trigger `docket_legislative_version_spine_registration` is enabled on cache insert/update and invokes `register_docket_legislative_version_spine(new.bill_id,false)`.
- Existing targeted API acceptance is `server/docket-bill-detail-acceptance.ts:accept_docket_bill_detail`, not a second importer. Its nonarchive path updates the existing cache; the production trigger registers metadata without automatic queue enqueue.
- Existing `civic-genome-final-source-reconciliation-worker.ts` is limited to enacted bills lacking enrolled/chaptered text: inappropriate for unenacted HB349.

## Candidate contract

The default invocation reads local Docket cache only; **no paid API requests**. A potential later explicit operator run must:

1. Run only on an approved isolated worker, with exact `DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256` matching the plan hash emitted by dry-run. This hash is an approval guard, not a substitute for authorization, review or access control.
2. Validate existing cache identity and retain both prior `doc_id` ↔ official PN URL tuples.
3. Make **exactly one** budget-controlled `get_bill(1940853)` call. No retries and no `getBillText` call.
4. Validate provider identity (`state PA`, `session 2192`, `HB349`), preserve prior document identities and order, prove a positive **provider-assigned** ID for PN4024's exact official URL, and fail with **no write** if missing or ambiguous. Never invent the new provider document ID.
5. Use existing `accept_docket_bill_detail` to update its cache. Re-read the Docket source-document key, provider ID/official URL and predecessor as well as the Civic Genome version/predecessor. Fail if any binding does not match.
6. Leave source-byte acquisition, official PDF styling/strikeout proof, Rosetta decomposition, Prism, Genome assembly, and publication separately held.

This proposal does not create a public HTTP endpoint, change database schema, adjust any worker's schedule, or bypass the existing credit reservation, Docket trigger or original source acceptance path.

## Execution boundary

Test only: `node --test tests/docket-hb349-print-refresh-guard.test.mjs`.

Draft operator dry-run after code review (unimplemented in production): `pnpm exec tsx scripts/docket-hb349-print-refresh.mjs --dry-run`.

**Do not run `--apply` without independent approval of this exact HEAD and plan SHA, budget check, isolated worker credentials, and validated rollback/failed-write readback procedure.**

The synthetic ID `3702400` appears ONLY in isolated tests. It is not asserted to be the real PN4024 provider document ID.
