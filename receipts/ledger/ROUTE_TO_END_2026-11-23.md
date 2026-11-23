# Route to the end — anchor file (survives compaction)

Read this first in any new session. Decisions here are made; do not re-ask.

## Why it has been slow (measured 2026-11-23 10:45 PT)
- Ingestion ran at concurrency 1: 294 versions/hour. 46,486 registered waiting, 48,537 ingested, 4,477 failed.
- Failure classes parked, not worked (CA HTML 1,642; HTML incomplete 723; 403 515; TLS MI/CT/MS 439; fetch_failed 380; url_invalid 377; empty 259).
- Round trips = 0 because of a three-gap door: quarantine returns true; no certification route; V15->Genome assembly adapter missing.
- Nothing dispatches V15 decomposition at scale (108 sources ever).

## THE REAL GAP (measured 10:50 PT)
- docket_bill_detail_cache: 212,767 bills, 212,060 with texts, 325,755 text versions.
- Only 39,138 bills / 99,506 source docs ever registered. 172,923 bills / ~250,004 versions never registered.
- docket_bill_processing_queue: 217,230 eligible, 0 moved in 24h. 198,862 are free bulk-archive (legiscan_bulk_json); 18,368 need the paid LegiScan API.
- Cause: shared activation worker capped to 5 canary IDs. Canary proved path (17 bills -> 49 docs -> 43 versions).
- Fix: PR #886 (empty allowlist = all ready). After merge set DOCKET_BILL_ACTIVATION_CANARY_QUEUE_IDS="" on srv-da9c7a1f2nfc73f2ee8g. Undo: put 5 IDs back.

## Phase A — Docket Room intake complete (no decomposition involved)
Done when: registered = 0, every failed row has a named class and a recorded remedy or a recorded "source unavailable".
1. Concurrency 1 -> 4 (DONE 10:45 PT, Render env + PR). Watch 1h: rate, 403s, memory. Then 8. Undo: set back to 1.
2. Work failure classes in order: CA HTML, TLS chains, 403, fetch_failed, url_invalid, empty, HTML incomplete.
3. Verify then register the 24,418 unregistered docket-cache pairs.
4. Find why 4,052 amendments evaluate "unresolved"; attach bases.

## Phase B — The door (first real output)
Done when: 5 worker-chosen bills complete Genome -> Rosetta -> Genome -> Prism with receipts.
1. Lock and receipt: PR #884 (built, tested, off). DONE pending merge.
2. V15 -> Genome assembly adapter, built alongside, not replacing.
3. Gate: lock AND receipt at the adapter.
4. Prism receipt.
5. Five worker-chosen round trips.

## Phase C — V15 decomposition dispatch at scale.
## Phase D — Filters added alongside (PDF geometry filter, convention registry gaps, clause reader, immutability sweep).

## Standing rules
No deletion of legitimate results. Build alongside, never override. No 2.x-style names. Real corpus tests. Production changes on user yes; "do it" = yes for the named step.
