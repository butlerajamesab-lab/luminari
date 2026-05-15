# Provenance Doctrine

## Purpose

This document defines the canonical provenance, ingestion, jurisdiction normalization, runtime projection, and governance doctrine for the Lighthouse legal backbone.

The legal backbone exists inside the Lighthouse Supabase project:

```text
wepxlinwbjrkqdzkqpar
```

This doctrine governs all legal data entering canonical Lighthouse legal infrastructure.

---

# Canonical Legal Backbone

The following Lighthouse tables are the ONLY canonical legal backbone:

- legal_statutes
- legal_case_law
- legal_enforcement
- legal_workflow_deadlines

These tables are canonical operational truth.

---

# Canonical Source of Truth Doctrine

The Lighthouse legal backbone is the ONLY canonical operational legal corpus.

Other systems MAY:
- read
- reference
- project
- decompose
- translate

canonical legal records.

Other systems MUST NOT:
- maintain duplicate legal corpora
- persist independent copies
- fork canonical legal records
- create parallel legal truth layers

---

# Rosetta Boundary Doctrine

Rosetta MAY:
- read canonical legal records
- translate laws deterministically
- decompose statutes
- structure legal definitions
- map legal authorities

Rosetta MUST NOT:
- own a parallel legal corpus
- persist procedural ontology
- store operational guidance
- contain workflow assumptions
- contain urgency systems
- contain escalation philosophy
- contain Alpha Lake ontology

Rosetta remains:

law -> deterministic legal translation

ONLY.

---

# Ingestion Requirements

Every canonical legal record MUST contain:

| Field | Requirement |
|---|---|
| citation | required, unique |
| jurisdiction | required |
| source_url | required |
| verification_status | required |
| source_checked | required |
| date_checked | required |

---

# Rejection Criteria

Reject any record that:

- lacks citation
- lacks authoritative source_url
- contains dead or placeholder links
- cannot be traced to authoritative source
- duplicates existing citation without new information
- uses summarized text where verbatim was required
- violates jurisdiction normalization doctrine
- contains fabricated or inferred legal text

Rejected records MUST enter quarantine infrastructure.

---

# Provenance Immutability Doctrine

Immutable after canonicalization:

- citation
- source_url
- jurisdiction
- canonical_record_id

Changes require:
- explicit audit trail
- provenance lineage preservation
- supersession linkage

Forbidden:
- silent mutation
- hard deletion of canonical records
- lineage destruction

---

# Jurisdiction Hierarchy Doctrine

Canonical jurisdiction formats:

- 2-letter state code
- federal
- DC

Territories:
- AS
- GU
- MP
- PR
- VI

Propagation rules:

| Scope | Propagation |
|---|---|
| federal | baseline everywhere |
| state | jurisdiction-specific only |
| county/local | localized override only |
| territorial | isolated unless explicitly linked |
| tribal | isolated unless explicitly linked |

---

# Runtime Separation Doctrine

| Layer | Responsibility |
|---|---|
| registries | persist canonical truth |
| views | project operational truth |
| engines | runtime synthesis |
| UI | render only |

Rules:
- Views NEVER become persistence layers
- Engines NEVER become canonical storage
- UI NEVER becomes synthesis infrastructure

---

# Runtime View Architecture

All operational runtime projections MUST use Postgres VIEWs.

Views project canonical truth.
Views NEVER become persistence infrastructure.

Recommended views:

- v_case_law_runtime
- v_jurisdictional_case_patterns
- v_operational_legal_summary
- v_case_law_lineage
- v_authority_conflicts
- v_enforcement_pathways

---

# Governance Doctrine

Forbidden:
- uncontrolled bulk modification
- silent rewrite passes
- unsourced ingestion
- provenance bypass

All ingestion scripts MUST:
- validate provenance
- validate jurisdiction
- validate citation uniqueness
- validate authoritative source
- validate canonical formatting

before INSERT.

Failed records MUST:
- enter quarantine
- preserve ingestion attempt lineage
- preserve failure reason
- remain reviewable

---

# Operational Separation Doctrine

Legal backbone:
- statutes
- case law
- enforcement authorities
- legal deadlines

Procedural ontology:
- workflows
- urgency systems
- escalation semantics
- operational guidance
- procedural navigation

Procedural ontology belongs to Lighthouse.
Deterministic law translation belongs to Rosetta.

---

# Canonical End State

The target operational state is:

- one canonical legal backbone
- immutable provenance lineage
- normalized jurisdictions
- deterministic runtime projections
- explicit ecosystem boundaries
- no duplicate legal corpora
- operational truth continuity
- runtime governance without semantic drift
