# Remaining workflow bindings: live evidence, 2026-09-12

Base: `cc2cea7130396929d19f418464a270f7cab6112a` (Luminari #635).
Source: read-only Supabase queries against Lighthouse project
`wepxlinwbjrkqdzkqpar`, and the existing intake loader/rule manifest.
Companion: `workflow-gap-evidence-20260912.json`.

**Decision: no additional procedural admission is supported by the explicit
bindings retrieved in this check.** No database writes, schema changes, new
claim aliases, legal applicability expansion, or workflow admissions occurred.
The 301 previously connected source workflows and six master workflows remain
the implemented connection. These findings explain the remaining records.

## 144 source-bound workflows without claim bindings

| Stored workflow type | Workflows | Ordered steps | Source logical records |
| --- | ---: | ---: | ---: |
| `housing_violation` | 51 | 285 | 52 |
| `insurance_denial` | 47 | 215 | 48 |
| `elder_abuse` | 46 | 225 | 47 |
| Total | 144 | 725 | 147 |

Observed:

- None of these three exact type IDs exists in `claim_catalog`,
  `canonical_claim_catalog`, `claim_definitions`, `claim_validation_rules`, or
  `claim_element_matrix`. The active intake claim catalog contains 48 claims.
- None of their 147 retained source payloads contains an explicit `claim_id`,
  `claim_ids`, `claim_type`, `claim_types`, or `claim_type_id` key.
- Retrieved `workflow_routes`, `workflow_definitions`, and
  `knowledge_cross_refs` do not supply an explicit identity binding between
  these workflow records and an admitted intake claim.
- The current Layer 14 aliases do not bind these types. For example,
  `habitability_violation` is an existing claim ID, but this check found no
  source-backed declaration making it equivalent to `housing_violation`.

Required next evidence: an explicit, reviewed relationship between the existing
workflow identity/type and a governed claim ID, including its jurisdiction,
supporting source identity/hash and pinpoint, binding version, and status.
If the necessary claim does not exist, establish its governed definition and
required elements before admitting it. A name or topic resemblance is not that
relationship. Any resulting binding must enter the frozen registry manifest and
its hash, with rejected/ambiguous bindings held and exact jurisdiction isolation
verified. No new relationship table or schema contract was created here.

## 181 records without source-workflow bindings

All 181 lack a `state_directory_workflow_promotion` row targeting their UUID.
None has a `state_directory_logical_record.canonical_record_id` link to that
UUID. All lack the structured `escalation_pathways.steps` array consumed by the
source-workflow reader. This is not a missed join against an existing promotion.

| Observed group | Records | Specific gap |
| --- | ---: | --- |
| Seeded `legal_aid` records | 153 | Empty procedure/escalation arrays; represented by existing resource rows |
| Seeded `workflow_support` records | 8 | Empty procedure/escalation arrays; represented by existing resource rows |
| Legacy complaint/escalation records | 20 | No identity-bound document source and no structured ordered-step records |

### 161 seeded resource records

All 161 have an existing `registry_programs` row satisfying the exact comparison
`workflow_registry.uuid = 'rp-workflow-' || registry_programs.id`.
For all 161 pairs, the stored jurisdiction, portal/website, agency,
filing-methods string/apply-notes, and workflow-type/program-category agree.
All 161 escalation arrays and related-statute arrays are empty.

These are retrieved field comparisons. Interpreting these as duplicate resource
projections is supported by those comparisons; the original construction script
was not retrieved. There is no explicit `registry_programs_crosswalk` row with
`source_table = 'workflow_registry'`, and this check creates none.

The retained filing-methods strings contain source DOCX filenames for 159 rows;
140 contain a filename and both table/row coordinates. Those coordinates can
support source recovery. They do not supply ordered procedural steps. Only
three rows carry a nonempty portal. The original resource IDs and their existing
resource access paths should be retained. Admission as a procedure would require
actual source-supported steps and claim/jurisdiction bindings. No resource or
workflow rows were removed or merged.

### 20 legacy complaint/escalation records

- Jurisdictions: 14 federal/United States, three Washington, three unspecified.
- Verification labels: 13 `verified`, two `mixed_verified`, one
  `verified_partial`, one `synthesized_from_verified_sources`, three empty.
- Five have empty escalation arrays; 15 have arrays of escalation labels.
  Eight have related-statute arrays, and 17 have nonempty portals.
- None has a source DOCX locator in its filing-methods field, a source promotion
  binding, or the ordered source-step structure required by this reader.

Required next evidence: retrieve the exact source/version for each existing
record, bind source identities to the retained UUID, reconstruct and validate
ordered steps from that source, and separately establish claim and jurisdiction
scope. A portal and a stored `verified` label do not prove the preserved source
or step order. The 14 federal records additionally require an explicit federal
scope contract: the current source-workflow gate accepts exact states and
territories. Treating federal applicability as every state would change that
contract. The three unspecified records also need jurisdiction and verification
status resolved. Existing escalation arrays were not reinterpreted as complete
procedures.

## Inspection limits

Inspected relations include the workflow registry, promotions and logical
records; the five claim/element registries above; workflow routes/definitions;
procedural paths; program records/crosswalks; knowledge cross references;
canonical ID records; decomposition mappings; and substrate dispositions.
The only retrieved decomposition mapping for `workflow_registry` is a generic
`deterministic_rule_v1` mapping into `normalized_records`; it does not establish
the missing source-workflow or claim bindings. No relevant canonical-ID,
substrate-disposition, or knowledge-cross-reference binding was returned.

This is not a claim that every attachment or external source has been searched.
Original files were not reopened because the current missing contracts and
record shapes already prevent procedural admission. Their eventual retrieval
must follow identity-bearing source locators rather than keyword matching.

## Acceptance for subsequent repairs

1. Preserve every original registry UUID, source record ID and source hash.
2. Reproduce exact bindings from stored identities and retained sources; expose
   ambiguous, missing, unsupported and non-procedural records explicitly.
3. Validate source/registry/promotion step agreement and ordering, including
   duplicate/conflicting source copies.
4. Keep source deadline text separate from calculated or verified deadlines.
5. Admit only explicit governed claim bindings and supported jurisdiction scope;
   keep outputs `candidate_unverified` until their own applicability is proven.
6. Re-run the actual loader and Layer 14 acceptance checks and inspect the
   deployed consumer. Counts or topic aliases alone do not prove integration.
