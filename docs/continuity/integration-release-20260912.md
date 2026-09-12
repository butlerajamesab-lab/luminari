# Existing database integration release — 2026-09-12

## Objective and method

Connect the data already stored in Lighthouse to its actual application readers and detail pages. Preserve source identities, jurisdiction, provenance, and held states. Separate a deployed reader connection from source admission, a parser fix from corpus replay, and service health from cross-service delivery proof.

The user authorized implementation, parallel work, GitHub integration, and deployment in this session. No production database writes were needed for the connections recorded below.

## Landed and verified

| Change | GitHub / main commit | Verification |
| --- | --- | --- |
| Existing workflow and resource readers; jurisdiction resolution; registry reader schema repair; admin workflow coverage | #635 / `cc2cea7130396929d19f418464a270f7cab6112a` | All PR and main checks passed. Render `dep-daif2tlckfvc73907qig` live. Public program detail and search return the same original identity and four contributing contacts. |
| Workbook relationship order, structural completeness, UTF-8 streaming, parser receipts | #634 / `fb3aac60c498417ddeb7099e3c5b98dcda72b6e3` | All PR and main checks passed. Render `dep-daif5oss728c73ah1tb0` live. Original 201-sheet workbook preservation matches an independent recount. |
| Source authority catalog and exact source detail in Legal Library | #639 / `213283d22b81099e07e3cfbf2b178869a823cca0` | All PR/main checks passed. Render `dep-daif7mgjo6nc73biiasg` live; browser list, detail and jurisdiction filter verified. |
| Existing office discovery to native detail | #640 / `87840c2f19bd37dff9ece17c8ba028a11439d5f0` | All PR/main checks passed. Render `dep-daifaih5efls738tmgvg` became live; public Everett Vet Center listing/detail/source link verified. Exact 3,423 active identities verified in the database. |
| Benefits search, contact readback and pagination | #641 / `0e934622f9ec718889d42d2dc1e48e2f0feeef07` | All PR checks passed; Render `dep-daifipoae00c73dc9njg` became live. NC/Atrium browser search expands all four contacts. Two federal API pages contain 20 distinct IDs each, with no overlap. |

The subsequent SAIS recovery merge #633 (`7e07abd3d19315d7c165aa4e1a056d01c8524059`) is live in Render `dep-daifjge8h83s739k3e40` and all five main workflows passed. It preserves the reader releases above. The prior main PR Test was cancelled by the newer push; that cancellation was not a test failure. Historical deployment IDs above identify completed releases; the latest deployment supersedes them.

The combined #635/#634/#639 tree passed 1,688 tests with two environment-dependent skips across 329 passing test files. Main `213283d` has exactly that tested application tree. Subsequent office and program-search changes have their own focused tests and release CI.

### Production acceptance of the registry repair

`canonicalRegistry.getProgramChain({programId:'RTCELL_11948'})` previously failed with an ambiguous `id` column. On the deployed repair it returns HTTP 200, original program `RTCELL_11948`, North Carolina (`NC`), resource identity `f3b9aa24-95a6-42e4-8810-511fd3d4283c`, four contact records with provenance, website `https://atriumhealth.org`, and contact `704-355-2000`.

`canonicalRegistry.searchPrograms({query:'Atrium Health',stateCode:'NC'})` returns that same identity exactly once. The original registry contact/website values remain explicitly null in `registry_source_fields`; the added values are identified as enrichment from the existing resource records.

The admin workflow coverage endpoint correctly returns HTTP 401 without authentication. The available browser is in public walkthrough mode, so the owner-only panel has not been exercised in an authenticated production session. Its loader, access boundary, and rendering are covered separately; this is not a claim of owner-session acceptance.

### Production acceptance of source authority references

The browser's Source Authorities tab shows 1,939 references, 1,762 ready and 177 held (121 conflicting jurisdictions, 56 unresolved). Opening reference `6d5d0858bedc8469c1e411dff8b3c797f9a05a21715d8bbed839a504e2e4492d` returns the same identity, the Vermont source document, locator `lines:576-597:statutory_authority`, its source and candidate hashes, and recorded authority text. Filtering to VT shows 36 references, 35 ready and one held. A held reference returns null from the public detail endpoint; a page beyond the end retains the full ready count with zero items. These remain references in source documents, not verified current legal text.

### Browser-discovered program-search repair

The original visible Search programs control filtered guided results only. Selecting NC and Healthcare displayed zero registry matches because a literal category label was the only database query. The follow-up connects entered text to the existing registry query with selected state, 300 ms debounce, truthful pending/error/empty states, and Previous/Next navigation over 20-record pages. Query and state changes reset the page and suppress stale rows. Equal program names now have an ID tie-breaker. Original IDs, enriched contact values and expandable contact records remain intact. Browser acceptance after deployment is NC → Search programs → Atrium Health → original `RTCELL_11948` and four contact records.

That NC browser sequence passed after deployment. The default scope now uses only recorded `federal` and `us-federal` IDs (187 references in the observed inventory; query `a` matches 183), without treating 122 `US` records as verified federal records. A later browser pass exposed two Arizona offices stored as federal and heterogeneous categories including legislators. Exact source-binding checks did not justify reassigning those IDs. The follow-up labels these as registry references and shows recorded, unverified classification; it does not claim eligibility or current officeholder status. See `benefits-registry-classification-20260912.md` for IDs, evidence and reproducible SQL.

## Parallel follow-through

| Path | Concrete work | Boundary |
| --- | --- | --- |
| Office discovery | Deployed exact `gov_offices` listings and native detail | Source IDs and locators remain intact; crosswalk promotion remains separate |
| Benefits UI search | Deployed search/contact/pagination; classification correction prepared | Preserve heterogeneous records and expose the recorded category and unresolved jurisdiction |
| Case context / #636 | Concurrent attachment/read/remove work reconciled with actual cases, collaborator access, intake jurisdiction and sealed action paths | Combined 1,771-test suite and TypeScript passed; review found non-statute callers requiring explicit reference kinds; fix under review |
| Source worker / #637 | Current-main integration and exact-run, bounded standalone runner prepared | 1,728-test suite, TypeScript and database replay passed; review corrections include missing download version, SQL source preservation and schema-declared arrays; no production Batch activation |

## Remaining source and integration work

* Workflow accounting is exact: 482 registry rows comprise 301 source-bound workflows and 181 held rows. Of the 301, 157 match current claim types; the other 144 comprise 51 housing-violation, 47 insurance-denial, and 46 elder-abuse workflows without retrieved explicit claim bindings. Of the 181 held rows, 161 are exact copies of existing resource programs and 20 lack bound procedures. See `workflow-gap-evidence-20260912.md` and `.json`; do not manufacture workflow steps or claim aliases.
* Resource identity accounting retains 232 accepted exact source-backed program identities, one conflicting direct candidate, and 2,434 unverified prefixed candidates. The exact contact reader reaches 41 programs and preserves 100 contributing contacts, filling 40 website fields and 41 contact fields.
* `resource_office_xwalk` remains empty. The recovered 873 proposals do not establish the asserted relationship; 820 domain-based candidates include role mismatches. Native office detail links are not a promotion of these proposals.
* The original workbook hash is `a8edb63c60d7a7738446260f288b81a89dd5e7844d5c63532f40a3df4552eb12`. Its 74,921 nonempty rows comprise 74,714 data rows, 201 headers, and six preamble rows. Atomic parsing emits 74,715 under its documented header policy. Full typed mappings and resumable replay remain work; a passing parser audit does not integrate every sheet into every consumer.
* Earlier SAIS recovery already staged 192 resources, 260 routes, 656 deadline fields, 26 documents, and 19 overlaps. Reuse that source evidence; do not repeat the import or treat source deadline text as a calculated deadline.
* Source-family reconciliation for legislators, agencies, organizations, media, campaigns, and case law still needs explicit source-to-canonical bindings and consumer readback. Name-only merges are not evidence.
* Signed cross-service receipts through Prism/Rosetta/Kaleidoscope/Esquire still need a real scenario. Healthy services and successful bridge tests alone do not establish delivery through that entire path.
* Historical PRs #239/#287/#403 are held proposals. Smaller #525/#526/#612 changes require overlap review; they are not a reason to restore entire old branches.

## Release follow-through

Update this section with the final merged commits, Render deployment IDs, public UI/API readbacks, and any remaining concrete blockers after the parallel paths finish. Preserve unfinished work in its branch with a precise continuation point.
