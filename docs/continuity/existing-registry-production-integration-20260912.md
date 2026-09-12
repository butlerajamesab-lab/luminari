# Existing registry integration — 12 September 2026

Scope: PR #635 connects existing workflow and program identities to the intake and Benefits Navigator readers. This is one part of the wider database integration; it does not complete workbook replay, SAIS publication, claim mappings, or cross-service correlation.

## Current-source revalidation

The PR head `f01d6d0e62d96c098107ac5182b4027034eeb9bf` was combined locally with deployed main `f6c7c6e75f5fd9f7dd7e2d8484e7c677a0da702b` (#638). Git merged the code without conflicts. The signal-reader changes are retained.

On 12 September, all six governed registry SELECT queries ran successfully against Lighthouse (`wepxlinwbjrkqdzkqpar`). The actual intake loader and Layer 14 were exercised against their captured results:

| Measure | Verified count |
| --- | ---: |
| Existing master workflows retained | 6 |
| Registry workflows inspected | 482 |
| Source-bound workflows loaded | 301 |
| Ordered steps | 1,555 |
| Source stage rows | 1,589 |
| State/territory jurisdictions | 55 |
| Workflows matched to existing claim types | 157 |
| Loaded workflows without existing claim bindings | 144 |
| Held registry records | 181 |
| Claim/workflow routing combinations exercised | 212 |

All 181 held rows have `missing_source_workflow_binding`. Their existence is accounted for; they are not admitted as procedures. Registry hash: `f3587fd515f372214c7ab0b6926db9c6376f28019a6afdc6bdc61b8c2d5a7fac`.

The program/contact query also ran against the live schema. Of 8,694 registry programs, 232 have admitted exact program/staging/extraction/resource identities; 41 have current contacts. The actual enrichment reader retained all 100 contributing contact records, recovered 40 blank website fields and 41 blank contact fields, and preserved original program IDs. The 13-case SELECT-only identity/publication fixture admitted only its accepted case. No canonical records or publication states were changed.

## Combined-code checks

TypeScript, production client/server builds, and health/security contracts passed. Fifty-seven focused workflow, resource-contact, and signal-reader tests passed; five case action-path projection contract tests also passed. Live-query snapshots exercise fixture claim candidates, not real case reruns or findings of legal applicability.

## Deployment acceptance

The pre-deployment HTTP check found an existing `canonicalRegistry.getProgramChain` failure: `column reference "id" is ambiguous`. Its workflow query joined two tables with `id` columns while selecting an unqualified `id`. The reader now selects qualified `w.*` fields; this fixes the entire program-detail path rather than one program record.

The merge and deployment must be checked separately from these results. After deployment, verify exact program IDs through `canonicalRegistry.searchPrograms`, `canonicalRegistry.getProgramChain`, and `canonicalRegistry.getCrossAvenuePrograms`, including retained contact provenance. Verify the workflow inventory through the actual governed loader and preserve all missing-source and missing-claim categories. Existing sealed case outputs are historical artifacts; this code change does not automatically replace them or establish that a new path applies to a case.

Remaining integration work includes the workbook completeness/parser lane (#634), legal/action consumers (#636), batch source processing (#637), explicit workflow claim mappings, and the unverified prefixed resource identities. Do not replay generated SQL or publish partial corpus runs to resolve those gaps.
