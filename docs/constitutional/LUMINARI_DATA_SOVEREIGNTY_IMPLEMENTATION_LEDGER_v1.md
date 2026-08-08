# Luminari Data Sovereignty — Implementation Ledger v1

**Constitutional rule:** Luminari temporarily carries user-owned information. The user may export or fully expunge it at any time. Only governed, non-reconstructive patterns and successful route structures may remain. Constitutional documents, rule manifests, public-source knowledge, and platform code are not user data and are not erased by a user-data deletion.

## Governing distinction

| Class | Ownership / authority | Deletion behavior |
|---|---|---|
| User-supplied source material | User | Exportable and fully expungable |
| User/case-specific derivatives | User | Exportable and fully expungable |
| Cross-platform case bindings, receipts, queues, projections | User while reconstructive or linkable | Deleted or rendered non-reconstructive/unreadable |
| Generalized pattern or successful route | Luminari only after governed promotion | May remain only after non-reconstructability proof |
| Constitutional doctrine, engine rules, manifests, source code | Platform/public governance layer | Versioned and preserved |
| Public official-source knowledge | Source-bound public knowledge | Preserved under source/provenance rules |
| Tribe-controlled material | Applicable tribe / designated authority | No cross-case retention or publication without explicit authority |

## Active implementation lanes

### Lane 1 — Canonical doctrine in source control

**State:** artifact prepared locally

Required repository destinations:

- `docs/constitutional/LUMINARI_DATA_SOVEREIGNTY_CONTRACT_v1.md`
- source-contract test proving the doctrine file exists and contains the non-retention, complete-export, complete-deletion, and non-reconstructive-pattern clauses

Acceptance:

- doctrine is versioned;
- no runtime or migration can redefine the rule silently;
- constitutional doctrine remains preserved when user data is deleted.

### Lane 2 — Live data inventory and deletion topology

**State:** read-only SQL audit prepared locally

Required repository destination:

- `supabase/verification/20260808_data_sovereignty_inventory_audit.sql`

Audit must enumerate:

- user/case/document/session/artifact ownership columns;
- foreign-key deletion behavior;
- storage/source identity columns;
- delete/export/purge/retention functions;
- RLS policies;
- Storage presence;
- Intake Spine sessions that survive legacy case deletion.

Acceptance:

- the audit runs read-only against production;
- every user-owned store is classified as delete, cryptographic-erasure, aggregate-only, or out-of-scope public/configuration data;
- unknown boundaries are explicit blockers.

### Lane 3 — Complete export manifest

**State:** design required after live inventory

The export must include original bytes, storage inventory, SHA-256 manifest, canonical outputs, provenance, unresolved states, engine/rule versions, receipts, generated work product, and both human- and machine-readable forms.

Required properties:

- deterministic inventory;
- completeness state;
- per-component hashes;
- download-time export timestamp;
- no secret values;
- independent verification;
- user export must not depend on payment, membership, or administrative approval.

### Lane 4 — Cross-platform deletion orchestrator

**State:** design required after live inventory

Lighthouse should issue a deterministic subject manifest and governed deletion outbox. Each platform returns an idempotent receipt.

Required target classes:

- Lighthouse/Supabase relational rows;
- private Storage objects;
- corpus snapshots;
- Intake Spine sessions/artifacts/layer outputs/verification/transitions;
- PRISM case-linked requests/receipts/queues;
- Atlas case-linked observations/candidates/signals;
- Civic Genome case-linked identities/events/traits/bindings/snapshots;
- Rosetta case bindings;
- Kaleidoscope case projections;
- Esquire packets/filings;
- caches, retries, indexes, dead-letter records, temporary files, stored exports, payload-bearing logs, orphan objects, and replacement chains.

Acceptance:

- deletion is idempotent;
- incomplete downstream deletion cannot be reported as complete;
- current state distinguishes `downstream_pending`, `completed_with_unresolved_boundary`, and `completed`;
- no shadow copy remains in a feeder or downstream service.

### Lane 5 — Immutable audit versus expungement

**State:** constitutional conflict to resolve explicitly

Auditability may remain immutable, but an immutable audit record may not retain reconstructive user content after deletion.

Required design:

- audit events use non-reconstructive deletion-operation identities after completion;
- payloads, filenames, source hashes, exact case IDs, user IDs, and source pointers are removed or encrypted under the destroyed subject key;
- the remaining audit proves that an operation occurred, when, under which engine/rule version, and whether all boundaries completed, without reconstructing the person.

Acceptance:

- deletion history is verifiable;
- deleted data is not recoverable through audit logs or receipts;
- receipt-chain integrity remains checkable after subject-key destruction.

### Lane 6 — Backup and restore boundary

**State:** unresolved until provider/runtime inventory is retrieved

Required design:

- subject- or case-scoped encryption keys for user-owned material;
- completed deletion destroys the relevant key material;
- backup-resident bytes become immediately unreadable;
- physical bytes expire under a declared rotation schedule;
- restore tooling cannot resurrect cryptographically erased subjects;
- restore preflight checks deletion/key-destruction ledgers before materialization.

Acceptance:

- a deleted test subject cannot be restored from any retained backup;
- backup retention is not represented as hidden user-data retention;
- Sovereign Spine portability remains available for platform/configuration/public knowledge without reintroducing deleted cases.

### Lane 7 — Governed pattern and success-route promotion

**State:** design required

No case record automatically becomes a retained pattern or route.

Promotion must prove:

- no source bytes/text/quotes/media;
- no names, aliases, IDs, storage references, or source pointers;
- no exact unique dates/addresses;
- no reversible hashes or fingerprints;
- no small-cell or rare-combination reconstruction risk;
- no retained provenance link to a deleted subject;
- rule/engine versions and generalized procedural structure remain.

Acceptance:

- deleting every contributing case leaves the promoted structure useful but non-reconstructive;
- a known-attacker replay using all deleted identifiers and hashes cannot link the retained pattern to a person;
- tribe-controlled material requires explicit tribal authority before any cross-case promotion.

### Lane 8 — End-to-end export/deletion drill

**State:** blocked on lanes 2–7

Fixture:

- one test user;
- one mixed-format case;
- PDF, DOCX, ZIP/media artifact;
- full deterministic reconstruction;
- downstream platform bindings.

Drill:

1. Export all user-owned state.
2. Verify completeness and every component hash.
3. Request deletion.
4. Reconcile all platform receipts.
5. Search every store with every known identifier, filename, source hash, object path, case ID, user ID, session ID, artifact ID, and receipt ID.
6. Prove no active or reconstructable data remains.
7. Prove backup material is cryptographically unreadable.
8. Prove retained patterns/routes are non-reconstructive.
9. Repeat deletion and prove idempotence.

## Immediate sequence once connectors are available

1. Commit the doctrine and read-only inventory audit to a dedicated branch.
2. Run the audit against the live Supabase project and save the result as a non-sensitive schema inventory artifact.
3. Inspect `server/hard-delete-canonical.ts`, Export Spine, Restore Spine, storage adapters, case identity bridge, Intake Spine triggers, PRISM/Atlas/Civic Genome bridge records, and log sinks.
4. Build the authoritative ownership/deletion matrix from retrieved structures—not assumptions.
5. Implement the smallest fail-closed vertical slice: one case export plus complete cross-store hard deletion, including the private Storage object and Intake Spine topology.
6. Add the constitutional acceptance drill before expanding to user-account deletion and cross-platform orchestration.

## Non-negotiable blockers

- A database-row delete without Storage deletion.
- A case delete that leaves snapshot hashes or Intake artifacts advertising deleted evidence.
- A receipt or log that preserves reconstructive payload after deletion.
- A backup that can restore deleted user data.
- A “pattern” that contains reversible identifiers, source hashes, rare combinations, or source pointers.
- A completion state issued before downstream receipt reconciliation.
- Any cross-case use of tribe-controlled material without explicit authority.
