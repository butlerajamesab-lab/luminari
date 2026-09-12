# Existing database integration release — 2026-09-12

## Objective and method

Connect the data already stored in Lighthouse to its actual application readers and detail pages. Preserve source identities, jurisdiction, provenance, and held states. Separate a deployed reader connection from source admission, a parser fix from corpus replay, and service health from cross-service delivery proof.

The user authorized implementation, parallel work, GitHub integration, and deployment in this session. No production database writes were needed for the connections recorded below.

## Landed and verified

| Change | GitHub / main commit | Verification |
| --- | --- | --- |
| Existing workflow and resource readers; jurisdiction resolution; registry reader schema repair; admin workflow coverage | #635 / `cc2cea7130396929d19f418464a270f7cab6112a` | All PR and main checks passed. Render `dep-daif2tlckfvc73907qig` live. Public program detail and search return the same original identity and four contributing contacts. |
| Workbook relationship order, structural completeness, UTF-8 streaming, parser receipts | #634 / `fb3aac60c498417ddeb7099e3c5b98dcda72b6e3` | All PR and main checks passed. Render `dep-daif5oss728c73ah1tb0` live. Original 201-sheet workbook preservation matches an independent recount. |
| Source authority catalog and exact source detail in Legal Library | #639 / `213283d22b81099e07e3cfbf2b178869a823cca0` | All six PR workflows passed, including the repaired source-contract tests. Deployment/readback tracked below. |

The combined #635/#634/#639 tree passed 1,688 tests with two environment-dependent skips across 329 passing test files. Main `213283d` has exactly that tested application tree; the only local differences at this checkpoint are continuity documents.

### Production acceptance of the registry repair

`canonicalRegistry.getProgramChain({programId:'RTCELL_11948'})` previously failed with an ambiguous `id` column. On the deployed repair it returns HTTP 200, original program `RTCELL_11948`, North Carolina (`NC`), resource identity `f3b9aa24-95a6-42e4-8810-511fd3d4283c`, four contact records with provenance, website `https://atriumhealth.org`, and contact `704-355-2000`.

`canonicalRegistry.searchPrograms({query:'Atrium Health',stateCode:'NC'})` returns that same identity exactly once. The original registry contact/website values remain explicitly null in `registry_source_fields`; the added values are identified as enrichment from the existing resource records.

The admin workflow coverage endpoint correctly returns HTTP 401 without authentication. The available browser is in public walkthrough mode, so the owner-only panel has not been exercised in an authenticated production session. Its loader, access boundary, and rendering are covered separately; this is not a claim of owner-session acceptance.

## Parallel follow-through

| Path | Concrete work | Boundary |
| --- | --- | --- |
| Office discovery | Connect exact `gov_offices` discovery records to native `/resource/gof_*` detail pages | 3,423 exact active office identities; do not infer resource-to-office relationships from names or domains |
| Benefits UI search | Wire the visible Search programs control to the deployed registry search and selected state | Browser showed the control only filtered guided results; do not invent category aliases to conceal missing bindings |
| Case context / #636 | Resolve the actual case namespace, ownership checks, and Sunam dispatch before integration | The draft reads nonexistent `luminari_cases`; signal link case IDs reference `public.cases`; preserve namespaces and authorization |
| Source worker / #637 | Integrate private-source observations with the landed workbook resolver, versions, completeness, and Unicode fixes | Source observation and source-preserving replay are distinct from canonical/public promotion; worker activation remains explicit |

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
