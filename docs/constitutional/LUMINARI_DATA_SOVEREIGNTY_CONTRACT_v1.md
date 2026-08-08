# Luminari Data Sovereignty Contract v1

**Status:** Constitutional platform contract  
**Scope:** Lighthouse, Universal Intake Spine, Rosetta, Atlas, Civic Genome, PRISM, Kaleidoscope, Esquire, Docket, Field Atlas, Sovereign Control, storage, queues, logs, exports, backups, and every current or future projection.

## 1. Canonical rule

Luminari holds user information in temporary custody, never ownership.

Every item supplied by a user, and every user- or case-specific derivative produced from it, remains theirs. At any time the user may:

- inspect it;
- export it in complete human-readable and machine-readable form;
- move it;
- correct or restrict it;
- delete it completely.

A completed deletion may leave no raw, identifying, linkable, reconstructable, or source-addressable user information in any active store, downstream platform, cache, queue, index, log payload, export bundle, or recoverable backup keyspace.

## 2. User-owned scope

User-owned data includes, without limitation:

- source files and exact bytes;
- filenames, MIME types, storage paths, hashes, and source metadata;
- narratives, messages, images, audio, video, and recordings;
- people, contacts, addresses, dates, relationships, and case identities;
- parsed text, pages, paragraphs, spans, and offsets;
- entities, events, chronology, facts, assertions, relationships, contradictions, findings, claims, and verification states;
- Intake Spine artifacts, layer outputs, receipts, and projections;
- PRISM requests and receipts tied to a person or case;
- Atlas observations or signals tied to a person or case;
- Civic Genome identities, events, traits, lineage, or momentum tied to a person or case;
- Rosetta case bindings;
- Kaleidoscope projections;
- Esquire packets, filings, and generated work product;
- audit records and operational metadata capable of identifying or reconstructing the person or case.

Derived data does not cease to belong to the user merely because an engine produced it.

## 3. What Luminari may retain

Luminari may retain only non-reconstructive generalized patterns and successful route structures that help a future person navigate their own path.

A retained pattern or route may include:

- governed rule identifiers and versions;
- generalized prerequisites;
- procedural steps;
- generalized deadlines and time windows;
- common barriers;
- escalation sequence;
- resource categories;
- generalized outcome states;
- engine, rule, and canonicalization versions.

It may not retain:

- source bytes, text, quotes, or media;
- names, aliases, case IDs, user IDs, document IDs, source pointers, or storage locations;
- exact addresses, exact unique dates, or rare combinations that permit singling out;
- reversible hashes or fingerprints derived from user data;
- provenance pointers back to a deleted person or case;
- small-cell aggregates or route details that permit reconstruction.

No record automatically becomes a pattern. Pattern or route retention requires a separate governed promotion process and a deterministic non-reconstructability proof.

Tribe-controlled material may not be promoted into retained cross-case patterns or routes without explicit authority from the applicable tribe.

## 4. Export contract

A complete export must include:

- every original source object unchanged;
- a complete storage inventory and SHA-256 manifest;
- all canonical structured outputs;
- chronology, entities, relationships, verification states, contradictions, and unresolved states;
- all engine, rule, parser, normalization, and canonicalization versions;
- provenance and receipt chains;
- generated documents, packets, reports, and presentations;
- human-readable representations;
- machine-readable JSON and CSV representations;
- a canonical inventory proving whether the export is complete.

Export must not depend on payment, continuing membership, administrative approval, or acceptance of a Luminari interpretation.

## 5. Deletion contract

Deletion is a cross-platform governed operation, not a row delete.

A deletion must account for and remove or render immediately unrecoverable:

- Lighthouse user/case/document records;
- Supabase Storage objects;
- corpus snapshot membership and hash maps;
- Intake Spine sessions, artifacts, layer outputs, verification records, transitions, and receipts;
- Lighthouse case projections;
- PRISM case-linked requests, receipts, queues, and failures;
- Atlas case-linked observations, candidate signals, promoted signals, and bridge records;
- Civic Genome case-linked identities, events, bindings, traits, snapshots, and projections;
- Rosetta case bindings;
- Kaleidoscope case projections;
- Esquire case packets and generated filings;
- jobs, retries, caches, indexes, temporary files, and dead-letter records;
- stored exports;
- payload-bearing logs;
- orphaned objects and replacement chains;
- decryptability of backup-resident data.

Deletion must fail closed: if the system cannot prove the complete inventory or cannot complete a required downstream deletion, it must report the unresolved boundary rather than falsely declare completion.

## 6. Backup contract

User/case data should be encrypted under a subject- or case-scoped data key. Completed deletion destroys the applicable key material so backup-resident bytes become immediately unreadable, while physical backup bytes expire under the declared rotation schedule.

Any unavoidable time-bounded retention must be explicit, encrypted, inaccessible to ordinary runtime use, and visible to the user. It may not be represented as complete deletion until cryptographic inaccessibility is proven.

## 7. Cross-platform propagation contract

Lighthouse is the frontend-facing control plane. A deletion/export request must issue a deterministic subject manifest and governed outbox operations to every feeder or downstream platform. Each platform must return an idempotent receipt. Completion requires receipt reconciliation across all declared boundaries.

No platform may silently keep a shadow copy after Lighthouse deletion.

## 8. Runtime state model

Data-control operations must expose truthful states:

- `requested`
- `inventory_running`
- `inventory_complete`
- `export_building`
- `export_complete`
- `deletion_running`
- `downstream_pending`
- `backup_key_destroyed`
- `completed`
- `completed_with_unresolved_boundary`
- `failed`

A request may not display `completed` merely because the primary database rows are gone.

## 9. Foothold rule

Luminari must never direct a person toward an action without showing the next stable foothold: authority, deadline, prerequisites, required evidence, expected burden, filing destination, confirmation state, failure route, and unresolved facts that could change the path.

## 10. Mandatory acceptance drill

For a test user with a mixed-format case:

1. Upload and preserve real files.
2. Run the complete deterministic vertical slice.
3. Export the full user-owned state and verify it against a canonical inventory.
4. Delete the user/case.
5. Search every active database, storage bucket, bridge, queue, cache, index, and payload-bearing log using every known identifier and source hash.
6. Prove zero active or reconstructable user data remains.
7. Prove backup-resident material is cryptographically unreadable.
8. Prove no orphan object, receipt, projection, retry, or stored export remains.
9. Prove any retained pattern or route has no reversible link to the deleted subject.
10. Repeat the deletion request and prove idempotent completion.

No platform is complete until this drill passes.

## 11. Retrieved current gap

The retrieved Universal Intake Spine foundation uses cascading foreign keys from `intake_sessions` into artifacts, layer runs, verification records, and transitions. However, deleting a legacy `cases` row cascades into `case_identity_bridge` and `case_intake_links` only; it does not, by itself, delete the linked `intake_sessions`. Database cascades also do not delete private Storage objects. Therefore case-row deletion alone does not satisfy this contract.
