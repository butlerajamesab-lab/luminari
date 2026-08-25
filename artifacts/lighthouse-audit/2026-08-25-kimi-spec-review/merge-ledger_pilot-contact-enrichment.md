# Merge Ledger — Pilot Contact Enrichment

> **RECONSTRUCTION NOTICE (2026-08-26):** This file was accidentally overwritten during the BIA pilot append. It has been rebuilt from session records. All entries below reflect work actually performed and verified; hashes, resource IDs, counts, and adjudications are preserved as recorded. If any earlier free-text nuance was lost, treat the database state (all writes were read-back verified) as authoritative.

**Standing constraints:** deterministic verification only; hash-based identity (SHA256/eTag/md5), never filename; zero-judgment writes — conflicts flagged, not resolved silently; fills carry `IS NULL` write guards and preserve old values in provenance notes; append-multi for multiple phones/offices, never silent conflicts; every statute needs citation + authoritative link; every resource needs contact info.

---

## RULES OF RECORD

- **Append-multi (2026-08-26, user-approved standing rule):** for ALL multi-office government entities (e.g. Dept. of Labor & Industries pattern), additional offices/phones are appended to `contact_raw_text` — never treated as conflicts. Same-department shared-exchange or toll-free-vs-local numbers are append-multi (2026-08-25).
- **Office-locator sourcing policy (2026-08-26):** official agency-published datasets are the preferred address/verification source — VA Facilities API, USDA/SSA/HUD/DOL/IHS locators, BIA regional-office pages, state open-data portals. Rationale: deterministic, hashable, cacheable, authoritative. Google Places EXCLUDED (ToS prohibits caching, non-deterministic). OSM/Overpass = candidates only.
- **Redone category docs (2026-08-26, user-approved):** MERGE AND UPSERT against existing resource_ids — not skipped, not duplicated. Divergences between old and new field values still flagged in this ledger; merge-upsert governs write mode, not conflict reporting.
- **Coverage-claim verification gate:** any "covers X" label must be checked against the authority's published service area.

---

## 2026-08-26 — CSV ingest complete: luminari-SAIS-ALL-RECORDS-2026.csv (sha8 fb433b18)

- 164 resource rows + 164 deadline rows ingested in batches (d00–d05; inserted counts 30, 30, 29, 28, 31, 16 = 164), idempotent `ON CONFLICT (resource_id) DO NOTHING` envelopes with per-batch inserted-count verification.
- Gates green: 0 orphan deadlines, 0 resources missing contact info, 164/164 deadlines linked to resources (FK `resource_id ON DELETE CASCADE`).
- sais_resources now 601 rows; sais_resource_deadlines 291 rows.
- CAT28/29/38 oddly-numbered overarching intake category — **RESOLVED per user: intentional** overarching intake category design.

## 2026-08-26 — Four-PDF assessment (context capture; hashes on record)

1. **Massachusetts Civic Resource Directory: Verified Facts and Corrections** — sha8 `caf76814`. 15 verified MA items. Corrections asserted: no MCAD New Bedford office; Worcester office is 18 Chestnut St Room 520 (not 484 Main St Room 320); BIA Eastern phone 615-564-6500 wrong → correct 615-827-5273 regional / 615-546-6500 ICWA designated-agent; address 545 Marriott Drive Suite 700, Nashville, TN 37214.
2. **American Samoa and CNMI: 2026 Verified Agency and Labor Resources** — sha8 `dd3328a7`.
3. **Wrongful Incarceration and Government Accountability: 2026 Resources (1)** — sha8 `ac81efb4`.
4. **Federal Civil Rights and Regulatory Tracking Update** — sha8 `0e5c5aac`. Reference-only tracking memo; no fills sourced from it.

### Fills written from the PDFs (7/7, write-guard `AND contact_phone_norm IS NULL`, read-back verified)

| resource_id | Fill |
|---|---|
| lmn_52de4197b4b05cfef3aea5f8 | MCAD main → 617-994-6000 (+3 office addresses, 300-day deadline) |
| lmn_74c7a89f0cf554e745c1bcbe | MCAD Civil Rights Gateway → 617-994-6000 + website |
| lmn_e37286bbcf818eb483522943 | MCAD Housing Division → 617-994-6000 |
| lmn_5ec97a8c5b10f659e1d96399 | GBLS → 617-371-1234 |
| lmn_84d829829c8f176ae55ebdcc | MLAC → 617-367-8544 |
| lmn_a416a9b15e7112ab260c30f8 | CLA → 855-252-5342 |
| lmn_020e4b07fc48c4a231b8682b | Innocence Project → 212-364-5340 |

### BIA conflicts flagged (from MA PDF cross-check — see pilot section below for resolution)

- `contact_phone_norm = '615-564-6500'`: 25 rows (ICWA routing rows).
- `contact_raw_text ILIKE '%711 Stewarts Ferry%'`: 31 rows (pre-relocation address).
- `'%545 Marriott%'` in DB: 0 rows.

## 2026-08-26 — Question adjudications Q1–Q6 + formatting sweep

- **Q1 append-multi:** resolved as standing rule (see Rules of Record).
- **Q2 GOIA verify+fill:** lmn_a755f40ab89fd55383ba86bb — website https://goia.wa.gov live-verified (HTTP 200, homepage confirms WA Governor's Office of Indian Affairs); phone normalized `360) 902-8827` → `360-902-8827`; provenance `[src: goia.wa.gov live-verified 2026-08-26]`.
- **Q3 dedupe/address batch verification:** queued.
- **Q4 formatting sweep:** phone anomaly `^\d{3}\) \d{3}-\d{4}$` → `\1-\2`; 34 rows fixed, 0 remain post-check; each fixed row carries `[format-normalized 2026-08-26: phone was '<old>']` in contact_raw_text. 151 multi-contact cells deliberately untouched.
- **Q5 CSFP '211' note:** DEFERRED per user — leave as-is until redone category docs arrive.
- **Q6 redone docs:** MERGE AND UPSERT (see Rules of Record).
- Ledger item "15 concatenated-phone splits": 0 rows found under digit-pattern detection — recorded as possibly-stale, not hunted further.

### New name-field defect flags (nothing written)

- 2 JSON-blob names; 2 literal `[object Object]` names.
- 1 truncated phone: AZ-RP-EMERGE-TUCSON-2026 carries `520-795-4266 (24` — cut mid-parenthetical (presumably "(24-hour...)").

### Idaho Legal Aid near-dupe cluster — FLAGGED, awaiting user adjudication (nothing written)

5 rows: lmn_3d4ee31c2fad06b5e69b3d9e (ILAS, Twin Falls phone + Boise address); lmn_825bc0f9f36431a57b0161d8 (208-342-6671, raw NULL); lmn_06c6b16ae621bba13e9b07a7 (Twin Falls full detail, phone NULL); lmn_7e6277099707b435c2d20e74 (statewide 7 offices, Twin Falls phone); lmn_018ff24da8bb737e420f7fda (literal "(Example" in name). Append attempted under standing rule but live DB ≠ prior description → stopped, nothing written. User call needed: merge to canonical row vs statewide+per-office; Idaho field-office address list would resolve via locator policy.

---

## 2026-08-26 — Government-locator pilot #1: BIA Eastern Regional Office (VERIFICATION COMPLETE, swap pending adjudication)

**Method (standing office-locator sourcing policy):** agency-published sources only, deterministic + citable. Three independent authoritative sources pulled live:

| Source | Address | Phone | Notes |
|---|---|---|---|
| bia.gov/regional-offices/eastern/contact-us (live fetch 2026-08-26) | 545 Marriott Drive Suite 700, Nashville, TN 37214 | (615) 827-5273 | email eastern.inquiries@bia.gov |
| Federal Register 2025-13018, ICWA Designated Tribal Agents (2025-07-11) | 545 Marriott Drive, Ste. 700, Nashville, TN 37214 | (615) 546-6500 | ICWA designated-agent-of-record line; fax (615) 564-6701 |
| BIA land-into-trust public notices (Aug 2026) | 545 Marriott Drive, Suite 700, Nashville, TN 37214 | (615) 827-5273 | current regional-office contact line |

**Adjudication of the MA-PDF (sha8 caf76814) correction claim — CONFIRMED on all points:**

1. DB value `615-564-6500` (25 rows) = outdated former main line. BIA's own current Contact Us page lists (615) 827-5273; the ICWA designated-agent line is (615) 546-6500 per the Federal Register. The MA PDF's "transposition error" framing is imprecise — 564-6500 was a real historical BIA Eastern number — but the conclusion stands: it is no longer the correct routing number.
2. DB value `711 Stewarts Ferry Pike` (31 rows) = pre-relocation address. Confirmed superseded by 545 Marriott Drive Suite 700 (already current in the Federal Register 2021 ICWA notice).
3. MA PDF values verified verbatim against bia.gov: 545 Marriott Drive Suite 700, Nashville, TN 37214 ✓.

**Proposed write (NOT YET EXECUTED — awaiting user approval):**

- 25 rows: `contact_phone_norm` → `615-827-5273`; provenance note preserving old value: `[corrected 2026-08-26 per bia.gov/contact-us + FR 2025-13018; was 615-564-6500 (outdated)]`; ICWA designated-agent line 615-546-6500 appended to `contact_raw_text` (append-multi, distinct purpose).
- 31 rows: address text → 545 Marriott Drive Suite 700, Nashville, TN 37214; old address preserved in provenance.
- Write guard: only rows still carrying the old values are touched; read-back verification per batch.

**Pilot verdict:** the government-locator approach works. One flagged conflict, three authoritative sources, deterministic resolution, full provenance. Same pattern queued for: VA Facilities API, DOL/USDA/SSA/HUD locators, state open-data portals; next candidates: Idaho Legal Aid cluster, Albuquerque IHS near-dupe.

---

## OPEN QUEUE

- BIA conflict swap — awaiting user approval (above).
- Idaho Legal Aid cluster — awaiting user call.
- Address addendum (courthouses/entities) + redone category intake docs — ingest on arrival as hash-identified sources; redone docs = merge-upsert with divergence flagging.
- Albuquerque IHS near-dupe dedupe + address-verification batch (queued).
- Locator pilot expansion: VA, DOL, USDA, SSA, HUD, state portals.
- Older standing: Q8 PS-009 confirmation; Q11 55-state extended lineage upload (zip preferred); Q12 Geocodio key rotation; Q13 roadmap (615 stranded intake rows, escalation_registry enrichment, government_benefits_registry 15%); workflow_master cross-walk; binding validation vs NO_BINDINGS_POSSIBLE baseline; 1,236 legal_statutes missing source_url; name-field defects above.
