# Database Continuity Guardrails

Date: 2026-05-12

## Why This Exists

Luminari's current disorder is not a sign that the product concept is incoherent. It is the residue of repeated database loss, replacement, and rebuild cycles during earlier platform work.

The immediate recovery risk is that future agents, contributors, or automation may respond to schema errors by creating another new database or broad migration path. That would repeat the failure pattern that already forced multiple rebuilds.

This document establishes a continuity rule: **the five canonical substrate lineages must be recovered, classified, and reconciled; they must not be replaced as a shortcut.**

---

## Core Continuity Rule

Do not create a new production, preview, or canonical application database to resolve runtime drift in any substrate. Luminari is composed of five Supabase-backed substrate lineages: Atlas, Lighthouse, Prism, Rosetta, and Esquire.

Allowed work:

- inventorying the existing Atlas, Lighthouse, Prism, Rosetta, and Esquire database lineages
- classifying existing tables into canonical recovery groups
- reconciling router references against the current table set
- adding narrow, reviewed schema migrations for verified gaps
- archiving legacy drift before deletion
- building compatibility shims only when they preserve provenance and are explicitly temporary

Forbidden work:

- creating a fresh canonical database because TypeScript, Drizzle, or router checks fail
- replacing Supabase/Postgres with another primary store during recovery
- importing TiDB/MySQL-era structure as the source of truth
- running broad migrations to satisfy every legacy router reference
- reconnecting all namespaces before dependency classification
- deleting historical tables before extraction, archival, and ownership review

---

## Single Source of Truth

The canonical data lineage is not a single replacement database. It is the coordinated set of existing Atlas, Lighthouse, Prism, Rosetta, and Esquire Postgres lineages, plus verified schema reconstruction from approved recovery sources.

Substrate ownership is defined in `docs/LUMINARI_FIVE_SUBSTRATE_PLATFORM.md`.

Canonical reconstruction must flow through these documents:

1. `docs/CANONICAL_RUNTIME_RECOVERY_STATE.md`
2. `docs/CANONICAL_OPERATIONAL_CORE_PLAN.md`
3. `docs/CANONICAL_SCHEMA_RECONSTRUCTION_RULES.md`
4. `docs/LUMINARI_FIVE_SUBSTRATE_PLATFORM.md`
5. this continuity guardrail

If these documents conflict with legacy runtime behavior, the documents win until the runtime is intentionally updated.

---

## Required Recovery Workflow

Before adding or changing database structure, complete this sequence:

1. **Identify the failing namespace.** Name the router, service, worker, UI page, or job that requires the table or column.
2. **Classify the dependency.** Mark it `SAFE_TO_ACTIVATE`, `BLOCKED_BY_SCHEMA`, `REQUIRES_REBUILD`, or `LEGACY_DRIFT`.
3. **Trace provenance.** Determine whether the dependency belongs to the upgraded deterministic architecture or an older runtime generation.
4. **Check existing schema.** Verify which substrate owns the table, whether it exists in that substrate's current Postgres lineage, and whether the Drizzle definition matches it.
5. **Choose the narrowest repair.** Prefer mapping, adapter cleanup, or a focused migration over broad schema creation.
6. **Document the decision.** Update the relevant activation ledger or recovery note with the reason for the change.
7. **Gate runtime exposure.** Do not mount the namespace until its database dependencies are verified.

---

## Database Change Decision Matrix

| Situation | Correct Response | Incorrect Response |
| --- | --- | --- |
| Router references missing table | Classify namespace, identify substrate owner, and verify whether table is canonical | Create a new database or bulk-create all missing tables |
| Drizzle type does not match Postgres | Reconcile definition to verified source | Rewrite live schema without provenance |
| Legacy MySQL/TiDB table is imported | Mark as legacy drift unless upgraded architecture requires it | Treat legacy import as canonical |
| UI page calls unavailable procedure | Disable or reroute page behind gate | Mount full router to make page stop failing |
| Job requires uncertain tables | Keep job off in gate mode | Start scheduler and let it fail at runtime |

---

## Runtime Implications

During recovery, database continuity depends on runtime restraint.

The gate runtime should remain the default recovery posture until operational-core dependencies are verified. Full runtime activation is only safe after namespace dependency reconciliation proves that required tables, columns, policies, and jobs are present.

Background jobs and schedulers must not be used as implicit schema validators. If a job touches the database, it needs an explicit allowed runtime mode and a verified dependency list.

---

## Practical Contributor Rules

When working in this repository:

- assume schema drift is a recovery artifact, not permission to start over
- preserve source attribution and table lineage wherever possible
- make small, reviewable database changes
- prefer disabling unsafe surfaces over reconnecting everything
- update documentation when a namespace moves from blocked to safe
- never solve a local error by inventing a new canonical database

The goal is not another rebuild. The goal is continuity: recover the five existing substrate lineages into one coherent, deterministic, attribution-first platform.
