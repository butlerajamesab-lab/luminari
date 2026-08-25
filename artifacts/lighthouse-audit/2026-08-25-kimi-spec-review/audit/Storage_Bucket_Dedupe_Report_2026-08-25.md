# Supabase Storage Dedupe Report — "State Enriched Registry bucket"
**Date:** 2026-08-25 · **Method:** deterministic, content-hash (eTag) based — filename never trusted
**Bucket:** `State Enriched Registry bucket` (public) · 422 objects · ~55 MB

## Headline numbers

| Metric | Count |
|---|---|
| Total objects | 422 |
| Unique contents (by hash) | 318 |
| Exact byte-duplicates (safe to delete) | 104 |
| Same-name groups with DIFFERENT content (version conflicts — need your decision) | 7 groups / 26 objects |

**Jurisdiction coverage confirmed: 56** — all 50 states + DC, PR, GU, AS, MP (CNMI), VI — present in BOTH:
- the `luminari-XX-registry-2026.docx` family (56 files, uploaded 2026-08-24, each with a `-realdata` twin = 112 files), and
- the `luminari-<state>-ENRICHED-PASS2/3-2026` family (56 + 1 extra PASS2 Colorado).

## What's in the bucket by family

| Family | Objects | Notes |
|---|---|---|
| registry-2026 (+realdata) | 112 | Your Aug-24 upload — the full 56-jurisdiction set, zero dupes |
| Resource directories | 87 | ~29 unique states/territories × up to 4 identical copies |
| PASS2/3 enriched | 57 | 56 jurisdictions, one per state (Colorado has PASS2 + PASS3) |
| SAIS master docs (DOC1–27) | 33 | All 27 present; 6 titles uploaded twice (identical) |
| Deep dives | 28 | 10 unique titles × 2–3 identical copies |
| Elder-care pipelines (EC-001…011, PS-004) | 17 | 12 unique × identical copies |
| Federal/master enriched (CLAIM-CATALOG, FEDERAL-MASTER, GAP-PLAYBOOK, SOL-COLLISION, BENEFITS-CASCADE) | 11 | 5 unique × identical copies + FED-STATUTORY-ANCHOR |
| Project2025 / P25 dossiers (md) | 21 | ⚠ Contains ALL 7 version-conflict groups |
| Tribal addenda | 3 | national + unrecognized tribes + Alaska |
| Other (zip, xlsx, legislators, verified directories, misc) | ~30 | incl. LUMINARI_EVERYTHING (1).zip, luminari_resource_directory_v3_13.xlsx, bmgf-grants.xlsx |

## Category 1 — Pure byte-dupes (104 objects, 27 groups)
Identical hash on every copy — these are re-uploads, not versions. Keeping the oldest-named (unsuffixed) copy loses nothing. Worst offenders: PIPELINE-EC-005 (5 identical copies), MASSACHUSETTS / NEW-YORK / RHODE-ISLAND / NEW-HAMPSHIRE / MAINE directories (4 identical copies each).

## Category 2 — Version conflicts (7 groups — same base name, different content)
Per your "newest upload wins" doctrine the latest copy would win, BUT in 6 of 7 groups the newest copy is SMALLER (truncated/chunked re-export?). These need your eyes before anything is deleted or imported:

| Base name | Versions (size bytes, newest last) |
|---|---|
| constitutional_powers_reference_pass1.md | 20068 = 20068 → **19202 (newest, smaller)** |
| P25-DOL-01_consolidated_deliverables.md | **14801 (unsuffixed, LARGER)** → 13573 = 13573 |
| P25-DOL-01_source_ledger_chunk1.md | **10813 (unsuffixed, LARGER)** → 6639 |
| P25-DOL-01_state_inventory_chunk1.md | 9404 = 9404 → 7298 ×3 (newer, smaller) |
| P25-DOL-01_state_inventory_chunk2.md | 8288 = 8288 → 6405 (newer, smaller) |
| P25-IA-01_mechanism_dossier.md | 12185 ×3 → 10337 → 5942 ×3 (progressively smaller) |
| project2025_mechanism_dossiers_batch1.md | 23251 = 23251 → **20450 (newest, smaller)** |

Pattern: the un-suffixed upload is often the LARGEST, and later "(N)" copies shrink — consistent with partial re-exports. Recommend: treat the LARGEST hash as canonical for these 7, pending your confirmation.

## Category 3 — Singletons (335 objects)
No action needed.

## Important scope note
This bucket's 56 PASS3 enriched files are a DIFFERENT, larger set than the 20-state import zip (`luminari_pass3_registries_source_docs.zip`) used for the completeness baseline. The bucket's PASS3 set covers all 56 jurisdictions; the zip's 20 were the SHA256-verified canonical subset. The 36 additional jurisdictions in the bucket have not yet been hash-verified against any manifest.

## Recommended next steps (nothing executed — your call)
1. Delete the 104 byte-dupes (reversible via a manifest backup first).
2. Decide canonical version for the 7 conflict groups (recommend largest-hash).
3. Extend the PASS3 extraction/verification baseline from 20 → 56 jurisdictions using the bucket's enriched files (needs download + SHA256 manifest build).
4. Apply the LUMI-\<STATE\>-\<TYPE\>-\<SEQ\> object-ID scheme at the 56-jurisdiction scale.
