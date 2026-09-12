# Existing database integration release — 2026-09-12

## Objective and method

Connect the data already stored in Lighthouse to its actual application readers and detail pages. Preserve source identities, jurisdiction, provenance, and held states. Separate a deployed reader connection from source admission, a parser fix from corpus replay, and service health from cross-service delivery proof.

The user authorized implementation, parallel work, GitHub integration, and deployment in this session. Reader connections reuse existing records. The native Supabase integration subsequently applied the function-only Batch manifest migration described below; Batch source registration and processing remain unperformed.

## Landed and verified

| Change | GitHub / main commit | Verification |
| --- | --- | --- |
| Existing workflow and resource readers; jurisdiction resolution; registry reader schema repair; admin workflow coverage | #635 / `cc2cea7130396929d19f418464a270f7cab6112a` | All PR and main checks passed. Render `dep-daif2tlckfvc73907qig` live. Public program detail and search return the same original identity and four contributing contacts. |
| Workbook relationship order, structural completeness, UTF-8 streaming, parser receipts | #634 / `fb3aac60c498417ddeb7099e3c5b98dcda72b6e3` | All PR and main checks passed. Render `dep-daif5oss728c73ah1tb0` live. Original 201-sheet workbook preservation matches an independent recount. |
| Source authority catalog and exact source detail in Legal Library | #639 / `213283d22b81099e07e3cfbf2b178869a823cca0` | All PR/main checks passed. Render `dep-daif7mgjo6nc73biiasg` live; browser list, detail and jurisdiction filter verified. |
| Existing office discovery to native detail | #640 / `87840c2f19bd37dff9ece17c8ba028a11439d5f0` | All PR/main checks passed. Render `dep-daifaih5efls738tmgvg` became live; public Everett Vet Center listing/detail/source link verified. Exact 3,423 active identities verified in the database. |
| Benefits search, contact readback and pagination | #641 / `0e934622f9ec718889d42d2dc1e48e2f0feeef07` | All PR checks passed; Render `dep-daifipoae00c73dc9njg` became live. NC/Atrium browser search expands all four contacts. Two federal API pages contain 20 distinct IDs each, with no overlap. |
| Recorded registry classification and integration evidence | #642 / `b224fee48127720c0d6fa681d9e1d5a096630c53` | Deployed. Browser verification of two Arizona records shows Recorded federal, Unverified, and category government_agency; stored identity and jurisdiction were preserved. |
| Owned case context, sealed intake paths and exact legal references | #636 / `f66e26ddc4bc33072158a61727a032f0eb14c854` | Merged; its Render `dep-daihlcgae00c73ddnnvg` was superseded by the verified combined deployment. Production exact legal reference readback and unauthenticated access boundaries passed; authenticated case writes were not exercised. |
| Private Batch source integration, bounded runner and reviewed source-integrity fixes | #637 / `e247ef3946b8e807d88fa9dcd1313b2449b46e1d` | Render `dep-daihln09qbnc73f6oa8g` live at 09:29:15 UTC. All five executable main workflows passed. Native migration `20260911201534` is applied; Batch manifest and artifact receipt counts remain zero. No runner activation or source processing claimed. |

The subsequent SAIS recovery merge #633 (`7e07abd3d19315d7c165aa4e1a056d01c8524059`) became live in Render `dep-daifjge8h83s739k3e40` and all five main workflows passed. Its changes are preserved in the final combined release. The prior main PR Test was cancelled by the newer push; that cancellation was not a test failure. Historical deployment IDs above identify completed releases; the latest deployment supersedes them.

The final application tree `6466463f9752cd332e7f02ec549ca0888223a4ac` at main `e247ef3` exactly matches the combined locally tested tree: 1,801 tests across 342 passing files, plus TypeScript. All five executable main workflows passed, including PR Test and Supabase Fresh Replay. Earlier narrower test counts remain historical checkpoints.

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
| Benefits UI search | Search/contact/pagination and classification correction deployed | Heterogeneous records retain their IDs and expose recorded category and unresolved jurisdiction |
| Case context / #636 | Deployed actual-case/collaborator access, intake jurisdiction, sealed action paths and explicit legal reference kinds | Exact public reference kinds and protected read boundaries verified; authenticated production case writes remain unverified |
| Source worker / #637 | Deployed source integration and exact-run bounded runner code; native function migration applied | Missing download ETag, source-only SQL and schema-declared array corrections passed; no Batch registration, worker activation or source processing |

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

The final deployed application is main `e247ef3946b8e807d88fa9dcd1313b2449b46e1d`, Render `dep-daihln09qbnc73f6oa8g`. After deployment, `/api/health` returned HTTP 200. Unauthenticated calls to `luminari.get_action_context`, `luminari.get_context` and the admin Batch lineage reader returned HTTP 401. These prove the public access boundary; no authenticated case write was verified.

`legalLibrary.get_reference` resolved the exact Vermont `legal_authority` with locator `lines:576-597:statutory_authority`, enforcement reference `fce42af5-420b-4bbb-b87e-721e6a02517b`, `settlement_formula:1`, and case-law reference `42a029cb-6393-5d54-8647-72f5d29864a8`. The held authority stayed unresolved with null detail. Explicit reference kinds preserve the intended source namespace across search, detail and case-context consumers.

The live native Batch migration receipt is now reconciled to the original filename and source hash in `supabase/verification/production_migration_receipts_20260912_addendum.tsv`. The function includes Batch and retains service-only execution. The read-only production check at 09:29:38 UTC found zero Batch manifest rows and zero Batch atomic artifact receipts. See `batch-main-integration-20260912.md` for the exact statement array, source binding and grants. The next source pass still requires verified runtime credentials, explicit scoped registration and bounded runner execution; no new paid service or runtime activation was performed in this release.
