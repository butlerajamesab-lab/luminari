# Benefits and cascade continuity

This change repairs the Benefits Navigator's source-card reads and introduces an individually reviewed placement of the supplied cascade sample. It does not certify the sample's legal assertions or import the supplied batch registries as new canonical identities.

## Retrieved source and version boundary

`luminari-benefits-cascade.docx`, SHA-256 `0cd47455cc22632cde282c039b03923134f5d4e7a9bc794e187e9765ca855034`, contains four scenarios and 17 stage rows. `shared/benefits-cascade-reference.ts` preserves each CAS identifier, stable stage identifiers and paragraph locations. The source's order describes the cascade; the interface opens each intervention independently. CAS-001 P40 explicitly calls for simultaneous activation.

| Source scenario | Stage placements | Runtime destinations |
| --- | --- | --- |
| CAS-001 P8–40 | Job loss; health insurance loss; housing instability; Medicaid disruption; mental health crisis | Existing Benefits matching and registry search; resource directory; selected-case Resolve |
| CAS-002 P41–68 | Safety; employment impact; housing; criminal justice involvement | Existing Benefits matching; domestic-violence, housing and defender resource searches; selected-case Resolve |
| CAS-003 P69–96 | Immigration contact; job/wage loss; benefits access; family separation | Immigration, employment and family resource searches; benefit matching; selected-case Resolve |
| CAS-004 P97–124 | Psychiatric hold; discharge; employment impact; housing stability | Patient advocacy, community mental health, employment and housing resources; benefit matching; selected-case Resolve |

These links are reviewed subject placements. They do not establish eligibility, a violation, a claim's applicability, a provider's availability, or a filing deadline. The sample's blanket legal assertions and durations require jurisdiction-specific primary-source review before operational use. The uploaded sample is not proven identical to the enriched source represented by 124 `benefits_cascade_stages` rows; no overwrite or equivalence claim is made.

## Public resource proof and actual cards

The four existing proof endpoint paths are retained. They now read the existing `normalized_civic_resource` table through an explicit public-field projection with `api_source_registry` identity matching. Read-only schema inspection confirmed public SELECT policies on both source relations. No grants or policies are changed.

- Counts and returned cards come from one query snapshot. A successful empty query returns zero; an unavailable query returns unknown counts.
- Coordinates and their recorded precision are counted separately. They do not create a verification badge or a promise that an address is an accessible service site.
- Names, source identity, source snapshot hash, eligibility text and contacts remain attached to each record. Similar names or shared phones do not trigger a merge.
- The category navigator consumes the existing canonical resource-directory summary and passes its exact category key and selected jurisdiction to the existing directory reader. Whole-directory counts are labeled as such.

Exact new SQL was executed read-only against Lighthouse: the `food_bank` scope returned five records, including two Food Lifeline names under different IDs/snapshot hashes. Several Washington rows share coordinates with `geocode_precision=unknown`; the patch does not turn those into directions or confirmed locations. The independently inspected DSHS source contains 62 rows with recorded coordinates. These are observations at review time, not embedded fallback counts.

## Program and case identity

The Benefits engine returns string `program.id` values. The previous card sent absent `program.program_id` to a numeric case-state benefit commit and to LumenSend. The card now uses the real string identifier for LumenSend and the existing application tracker. The invalid numeric commit is removed. Case selection is resolved against cases already returned to the authenticated user, accepting the old URL `caseId` at the boundary. An explicit invalid or unavailable requested case does not silently select a different case.

An application linked to a case now requires that case to belong to the user in the same INSERT statement. Personal tracking without a case remains available. This change does not expand collaborator permissions or claim that an application bookmark has been committed to the numeric legacy case-state benefit list.

Tracked-program badges are derived from records matching the currently selected case; they are not retained in an independent local set. A mutation that completes after a case switch refreshes the exact query for the submitting case. Personal applications and missing case metadata are handled separately. Rendered-page regression tests exercise both the transition and a delayed mutation completion.

## Supplied batch continuity: preserve identities pending reconciliation

The supplied `batch_013` has 13 program records, 11 administering-agency records, 13 workflows, 13 routing records, 47 escalation records and 13 statute records. Its program UUIDs and parent references must remain intact while aliases are reconciled. The source labels these program records `partial_verified`; it does not establish state-specific eligibility or a universal application telephone number.

Read-only comparison found these existing candidate representations. Similar program names are evidence for review, not sufficient authorization to merge records or assert that every source relationship is already incorporated.

| Supplied program UUID | Program | Retrieved existing candidate identifiers | Required distinction |
| --- | --- | --- | --- |
| `2653e1b6-2686-5755-88c0-2495e00ad772` | SNAP | `ben-snap-001`, `fed_benefit_snap`, `rp-benefits-rp_4aa6a2e54087ec4f` | Federal program versus state-administered route; do not merge Disaster SNAP |
| `a7cab83f-8bba-5382-9ff1-32e37700c51d` | Medicaid | `ben-medicaid-001`, `fed_benefit_medicaid` | Federal program versus state implementation; retain hearing and ombudsman route roles |
| `d5899360-d48f-5873-83aa-2387df72681a` | SSI | `ben-ssi-001`, `fed_benefit_ssi` | Preserve territorial applicability as a separate reviewed question |
| `89f8fc49-fcac-5181-ae48-92fa70120e79` | SSDI | `ben-ssdi-001`, `fed_benefit_ssdi` | Keep insurance eligibility distinct from SSI and unemployment |
| `bfc3b96d-82d4-5ce6-90a5-b804eea372e4` | Housing Choice Vouchers | `ben-section8-001`, `fed_benefit_section8_hcv` | Local PHA administration, waitlist and review routes remain separate |
| `496f453d-1c59-5407-afa2-7cf10a86f07a` | Lifeline | `util-lifeline-001`, `fed_benefit_lifeline` | Do not merge Food Lifeline, a food-bank network |

No migration from `master_seed.sql` is applied: its `record_json` table layouts differ from the live structured tables. No missing-UUID observation is presented as proof that the content is absent. Full batch relationship reconciliation remains a separate, explicitly incomplete section.

## Validation and overlapping work

- PostgreSQL-compatible tests exercise exact resource SQL: bounded samples, actual totals, source-ID joining, unmapped rows and query failure.
- PostgreSQL-compatible application tests prove string identity preservation, owner-bound case insertion and personal tracking.
- Rendered component tests cover all 17 stage destinations, jurisdiction and case navigation, source-version uncertainty, no-case guidance, error states and real contact cards.
- Existing registry-search tests remain passing. The Benefits page bundles successfully.
- Open PR #525's plain-language case guidance is incorporated in the rendered component; its earlier review warned against unscoped source-text assertions. Open PR #523's reviewed-route allowlist belongs to the enforcement reader and is not bypassed or duplicated here.

No production mutation, deployment, or legal-source promotion is part of this local change.
