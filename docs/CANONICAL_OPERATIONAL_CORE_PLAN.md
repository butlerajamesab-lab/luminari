# Canonical Operational Core Plan

Date: 2026-05-11

## Objective

Stabilize Lighthouse/Luminari by activating only the verified deterministic operational core before reconnecting the full upgraded runtime.

This plan intentionally avoids:

- broad runtime activation
- full router mounting
- broad RLS mutation
- speculative schema restoration
- legacy TiDB reconstruction

The goal is:

> preserve upgraded deterministic architecture
> rebuild upgraded implementation clean

---

# Verified Current Runtime State

## Active Runtime

Currently mounted:

- lighthouseGateRouter
- ai-inspect-router

Current runtime mode:

- controlled gate / inspection runtime

Not mounted:

- routers-complete.ts

## Verified Constraint

- 116 / 456 router-referenced tables currently exist.

Therefore:

- full upgraded router activation is unsafe today.

---

# Operational Core Activation Domains

## Phase 1 Domains

Only these domains should be stabilized and activated first.

### Governance

Includes:

- governance_log
- metadata_machines
- machine_outputs
- machine_verification_requirements
- pipeline_runs
- system health surfaces
- mission control metrics

### Legal Backbone

Includes:

- legal_statutes
- legal_case_law
- legal_definitions
- legal_enforcement_records
- legal_weak_joints
- legal_statute_key_text

### Resource Backbone

Includes:

- civil_gideon_directory
- national_resources
- agency registries
- remedy templates
- filing templates
- workflow references

### Signal Infrastructure

Includes:

- detected_signals
- signal_events
- streams
- prime_patterns
- signal bridges
- civic map visibility

### Atlas Bridges

Includes:

- atlas_lighthouse_signal_bridge_v1
- atlas_lighthouse_resource_bridge_v1
- atlas_lighthouse_judicial_signal_bridge_v1
- atlas_lighthouse_legal_bridge_v1

---

# Deferred Domains

These remain deferred until canonical schema reconstruction is complete:

- full procedural orchestration
- escalation automation
- export chains
- workflow mutation systems
- full action queues
- runtime orchestration surfaces
- full interpretation projection layer

---

# Canonical Schema Reconstruction Rules

## Allowed Sources

Canonical schema reconstruction may derive ONLY from:

- EXISTING_GOOD tables
- KEEP_AND_BUILD tables
- upgraded runtime references
- upgraded deterministic architecture
- verified populated backbone assets

## Forbidden Sources

Do NOT reconstruct from:

- TiDB drift
- mysqlTable schemas
- placeholder engines
- speculative manifests
- duplicate V* runtime eras
- dead experimental runtime branches

---

# Canonical Deterministic Boundary

## L0-L6

Recorded deterministic reality.

## L7

Deterministic projection boundary.

No mutation authority.
No hidden interpretation.
No runtime bypass.

## L8-L11

Accountable action and visibility.

---

# Namespace Activation Strategy

Every upgraded namespace must be classified before activation:

- SAFE_TO_ACTIVATE
- BLOCKED_BY_SCHEMA
- REQUIRES_REBUILD
- LEGACY_DRIFT

Only SAFE_TO_ACTIVATE namespaces may be mounted during operational-core recovery.

---

# Runtime Cleanup Rules

## DROP

May only include:

- unreferenced legacy tables
- dead TiDB artifacts
- duplicate drift structures
- experimental runtime remnants

## ARCHIVE

Historical runtime/state artifacts should be archived before deletion.

---

# Current Priority Order

1. Canonical schema skeleton
2. Namespace dependency reconciliation
3. Operational-core activation
4. Worker reconciliation
5. Canonical RLS reconstruction
6. Legacy cleanup and archival

---

# Constitutional Rule

The architecture is canonical.

The current plumbing is not canonical.

Implementation must conform to architecture — not the reverse.
