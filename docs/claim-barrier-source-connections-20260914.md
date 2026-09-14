# Claim and barrier source connections

This change repairs the reference connections used by Resolve, Claim Elements,
Proof Frameworks and Litigation Barriers. It does not promote document assertions
into the canonical legal backbone and does not claim that a legal case is resolved.

## Retrieved evidence and identity

The supplied `luminari-claim-catalog.docx` was read individually through paragraph
839, including all 27 detailed entries and all ten numbered barrier definitions.
`server/config/reviewed-claim-barrier-catalog.json` retains the original DOCX SHA-256,
exact paragraph spans, explicit source claim labels, and the existing
`claim_catalog` IDs 22–48. Identity mappings were compared against the retrieved
Supabase rows; no name-based merge is performed at runtime.

The fixture contains manually selected source fields, not output from a general
extractor. A one-time reading transcription preserves the explicitly selected
paragraphs; field boundaries and relationships were assigned individually. The
fixture is a source-placement reference, not a competing legal corpus. Its
`legal_verification` is `unverified`, its `case_applicability` is `not_assessed`,
and `automatic_legal_actions_allowed` is false throughout.

The supplied bytes have not been reconciled to a current Supabase source artifact.
Their filename must not be treated as proof that another enriched version is
identical. The original document was not inserted into Storage by this change.

## Runtime connections

- `match_claims` searches existing, nondeprecated `claim_catalog` rows. Reviewed
  source terms extend discovery while the existing exact claim ID is retained.
  Jurisdiction never manufactures a match or establishes coverage. Relevance is
  disclosed as matched terms; it is not represented as legal confidence.
- `get_proof_checklist` uses exact identity. It never substitutes the next record
  in the same domain. A source checklist is separate from a `proof_frameworks`
  record; its claim ID cannot be used as an evidence-framework primary key.
- `get_barrier_alerts` presents the manually related source barrier definitions as
  questions for review. The existing guard excluding ingestion and legacy-derived
  references remains in place. A related topic is not a case-applicability finding.
- The same reference catalog appears on Claim Elements, Proof Frameworks and
  Litigation Barriers. Links into Resolve preserve `claim_type` through the source
  proof and barrier steps. The existing case evidence controls remain bound only
  to real proof-framework IDs.
- The unused `resolveCase` shortcut previously declared `resolved=true` after only
  choosing one keyword match. Its replacement `resolve_case` uses the same catalog
  identities, supplies available source references, and explicitly leaves agency,
  deadline, legal applicability and proof binding unresolved.

Touched endpoint contracts use snake_case; legacy camelCase request payloads are
accepted only at the boundary and immediately normalized. Drizzle's existing
schema field names are read at the database boundary. React, tRPC, JavaScript and
component-library API properties retain their required external names.

## Concrete source issues preserved

The fixture records nine review issues rather than silently correcting or
publishing assertions. Examples include the blanket SSI territorial exclusion,
the mixing of Title II and Title III web accessibility in one entry, dated federal
agency capacity claims, and overbroad exhaustion/deadline outcomes. The ten BAR
definitions are preserved individually with their own source spans and review
questions. BAR-003 qualified immunity has no forced equivalent among the 27
detailed claims: ADA Title II is not a substitute for a Section 1983 identity.

Three inspected proof records contain the wrong underlying process:

| Claim label | Stored domain | Review issue |
|---|---|---|
| SSDI_Denial | unemployment | Source describes unemployment proceedings |
| Medicaid_Wrongful_Denial | food_nutrition | Source describes food-benefit proceedings |
| Housing_Discrimination_FHA | housing | Source lists administrative eligibility and compliance |

Resolve excludes those exact pairs from its proof checklist. The architecture
proof list, ID reader and claim reader preserve their fields but expose
`needs_source_repair`, an explicit reason, and no usable element checklist.
The Proof Framework page keeps the original fields inspectable under that warning.
Other rows remain unverified references; absence of this specific issue does not
certify them as legally correct.

## Dependencies carried to parallel tracks

The GAP Playbook's state profiles, eight fallback routes and employer-size matrix
are potential related references, not universal legal predicates. In particular,
GAP paragraph 75 describes Georgia as a 300-day deferral context while SOL Collision
paragraphs 81–85 include Georgia in a 180-day nondeferral group. These assertions
must be reconciled against the particular claim, employer, jurisdiction and
current primary authority before any filing date is calculated. No automatic
deadline is derived from either document in this change.

Colorado wage routing uses the existing minimum-wage and overtime claim identities;
neither is silently aliased to a generic deadline-rule label. CAS-004 can reference
DIS-003, EMP-003, HLT-002, HLT-003, BEN-001 and HOU-002 where its individually reviewed
stage supports the relationship. Those connections remain source-topic links.

## Validation and remaining boundary

Five focused tests check identity preservation, closed claim/barrier links,
Colorado wage discovery, unknown-identity behavior, refusal to fabricate legal
confidence or durations, and all three inspected wrong-process proof mappings.
All passed, along with three existing runtime/schema compatibility checks updated for the owned snake_case proof contract (eight tests total). Seven changed TypeScript/TSX entry files passed esbuild syntax
transformation. Production database mutations and deployment were not performed
by this track. Full combined application validation belongs to the integration
checkout after the deadline, pathway, resource and architecture tracks are joined.

Remaining work includes primary-authority legal review, exact existing-proof
bindings, jurisdiction/forum/deadline applicability, source-artifact reconciliation,
and full case-workflow execution. The new reference connections expose these gaps;
they do not mark those tasks complete.
