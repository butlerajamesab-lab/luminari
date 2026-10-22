# Docket Room coverage and unification backlog — 2026-10-01

## Status

Documentation only. This file does **not** authorize a code, schema, worker, provider, routing, UI, cache, or data migration change.

The immediate priority is to prove the existing state/federal Docket path exactly as it is before expanding or unifying jurisdiction classes.

## Current Docket Room jurisdiction surfaces

The Docket Room UI exposes these jurisdiction levels:

- Federal
- State
- County
- City / Municipal
- Tribal

The current connected state is:

| Level | Current state | Current source/path |
| --- | --- | --- |
| Federal | Connected | LegiScan-backed Docket state/federal acquisition path; jurisdiction `US` |
| State | Connected | LegiScan-backed Docket state/federal acquisition path; 50 states + DC |
| City / Municipal | Partially connected | Seattle only, via direct Seattle Legistar live API |
| County | Not connected | No source adapter established |
| Tribal | Not connected | No source adapter established |

The frontend `All` selector is an aggregation/presentation selector. It does not mean all jurisdiction classes currently share one ingestion substrate.

## Current state/federal canonical path

The state/federal path is the path that must be proven first.

```text
LegiScan / Docket provider observation
    ↓
Docket state/session cache
    ↓
Bill detail observation
    ↓
Docket bill source documents
    ↓
Civic Genome bill/version registration
    ↓
Version lineage / predecessor graph
    ↓
Current Docket authority leaf
    ↓
ordinary legislative-version queue
    ↓
Rosetta main entrance
```

### State/federal selection contract to verify

The intended operational selection is the **100 most recent bills per state/federal jurisdiction**, not the entire legislative session.

That selection limit must not be confused with version lineage.

A selected bill may legitimately have many successive source-document versions:

```text
introduced
→ amended
→ committee substitute
→ engrossed
→ enrolled
→ chaptered
```

Every observed version is historical/legal lineage and must remain separately addressable. Multiple versions of one bill are **not duplicates**. Repeated provider labels such as `Amended` or `Committee Substitute` are also not duplicates when their provider document/source identities differ.

Do not deduplicate, collapse, overwrite, or discard legitimate version history in order to enforce the 100-bill acquisition window.

## Seattle municipal path

Seattle predates the state/federal expansion and is currently separate.

Current implementation:

```text
Seattle Legistar Web API
    ↓
docket.legistarFeed
    ↓
Docket Room live municipal panel
```

The current UI asks for six recent matters and refreshes the panel every five minutes.

This path is not currently the same persisted Docket → Civic Genome → version-lineage substrate used by state/federal legislation. Do not force it into that substrate during the current verification phase.

The generic Docket entry registry rendered below the live feeds is also a separate surface. Its empty state does not mean the state/federal or Seattle feeds are empty.

## Freeze during current verification

Until the existing state/federal path is proven:

- Do not replace Seattle Legistar.
- Do not migrate Seattle into the state/federal substrate.
- Do not add County or Tribal adapters.
- Do not change the visible jurisdiction taxonomy.
- Do not reinterpret the 100-most-recent bill window as a deduplication rule.
- Do not collapse legitimate bill versions.
- Do not add a fallback provider.
- Do not add a second current-authority selector.
- Do not route around Docket lineage to feed Rosetta.
- Do not use historical campaigns or prior Rosetta executions as current Docket proof.

## Current verification work before expansion

The existing state/federal system should be considered ready for expansion only after all of the following are demonstrated from production evidence:

1. Every expected state/federal jurisdiction is present: 50 states + DC + US.
2. The acquisition window is actually the intended 100 most recent bills for jurisdictions with more than 100 available bills.
3. Jurisdictions with fewer than 100 available/currently returned bills are represented honestly rather than padded or substituted.
4. Every selected bill can obtain its bill-detail observation through the ordinary Docket path.
5. Every observed legislative text/amendment version is preserved with a distinct source identity.
6. Version predecessor lineage is complete enough to resolve one current leaf without deleting historical versions.
7. Current-authority leaves enter the ordinary legislative-version queue without manual queue manufacture.
8. Docket currentness/freshness does not silently erase the underlying corpus.
9. The Rosetta handoff consumes only the Docket-authoritative current leaf through the normal main entrance.
10. UI counts distinguish selected bills, preserved bill versions, amendments, current authority, and separate municipal live-feed records.

## Future unification objective

After the current state/federal path is proven, the long-term objective is one Docket Room with one normalized jurisdiction/provider contract across:

```text
Federal
State
County
City / Municipal
Tribal
```

Preferred provider direction: use LegiScan wherever verified provider coverage actually exists and is sufficient for the jurisdiction class. Provider capability must be verified before replacing an existing source. Do not assume municipal, county, or tribal coverage.

If a jurisdiction class requires another official/provider adapter, it should still emit the same normalized Docket source contract rather than creating a parallel downstream architecture.

Target shape:

```text
provider-specific acquisition adapter
    ↓
normalized Docket source contract
    ↓
immutable source/document identity
    ↓
jurisdiction-appropriate lineage/currentness
    ↓
one Docket handoff contract
    ↓
Rosetta main entrance when the source class is eligible
```

Provider differences belong at acquisition. They should not create separate Rosetta paths.

## Expansion backlog

### Federal

- Preserve current US path.
- Verify the 100-most-recent selection contract.
- Verify current-session/session-label semantics.
- Verify version and amendment lineage.
- Verify ordinary Rosetta handoff.

### State

- Preserve current 50 states + DC path.
- Audit the 100-most-recent selection behavior across all jurisdictions.
- Reconcile observed counts against provider responses without deleting existing historical/version data.
- Verify freshness cadence separately from corpus retention.
- Verify one current lineage leaf per selected bill.

### City / Municipal

- Preserve Seattle Legistar unchanged during current verification.
- Inventory Seattle fields, identities, statuses, histories, documents, votes, bodies, and events.
- Determine whether LegiScan can supply equivalent municipal coverage before changing providers.
- Define the normalized municipal Docket contract.
- Prove parity against Seattle before any cutover.
- Add additional municipalities only after the contract is proven.
- Do not remove the existing Seattle path until a replacement passes source, identity, history, and UI parity checks.

### County

- Identify candidate provider/official sources.
- Determine whether LegiScan exposes sufficient county legislative coverage.
- Define county jurisdiction identity and legislative-object identity.
- Define history/version/currentness semantics.
- Build one adapter into the normalized Docket contract.
- Prove on a bounded county cohort before wider rollout.

### Tribal

- Establish jurisdiction identity rules before ingestion.
- Identify authoritative tribal legislative/public-law sources.
- Determine whether LegiScan exposes sufficient tribal coverage.
- Preserve sovereign-jurisdiction distinctions; do not force tribal law into state/county identity.
- Define version/currentness semantics appropriate to the source.
- Build one adapter into the normalized Docket contract.
- Prove on a bounded tribal cohort before wider rollout.

## Acceptance rule for future jurisdiction adapters

A new jurisdiction/source adapter is not considered integrated because it can display cards.

It is integrated only when it can prove:

- authoritative source identity,
- immutable source/document identity,
- jurisdiction identity,
- version/history preservation,
- currentness selection,
- provenance,
- failure visibility,
- ordinary downstream handoff,
- reproducible readback,
- and UI representation without fallback to another jurisdiction/source.

## Governing principle

**First prove the state/federal Docket exactly as it exists. Then expand.**

The future goal is a unified Docket Room, not a collection of parallel legislative systems. Acquisition may differ by provider, but downstream identity, provenance, lineage, currentness, and handoff contracts should converge before Rosetta.
