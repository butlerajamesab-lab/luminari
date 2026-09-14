# Exact-source resource transcription corrections

The Colorado source document retains names, contact fields and individual program
notes that the current resource projection has misplaced. The reviewed packet
identifies 24 existing object IDs and exact Word paragraph coordinates. These
corrections restore those source fields without changing the source bytes,
canonical IDs, publication decisions or verification states.

This is a bounded transcription correction. It is not a whole-document review,
agency/contact re-verification, legal review, organization merge or reclassification.
The corrected eligibility and application text remains a source assertion. In
particular, Colorado's category proposals remain outside this change; a resource
can have corrected text while still requiring classification review.

## Existing mechanisms inspected

- `activate_luminari_reviewed_source_overlay_v1` requires all source pages and
  expected records reviewed, a completed manual-review run and action bindings.
  Its requirements remain unchanged. This packet does not satisfy that contract.
- `luminari_reviewed_source_record_revision_v1` and reviewed-source supplements
  belong to that manual-review run model. Supplements explicitly require a
  separate publication decision. They are not repurposed as an implicit gate.
- PR 646, head `101829d39f82a1418f2bcfb2e30f7166b5395184`, prepares repaired DOCX
  candidates only. It does not modify runtime records or verify legal content.
- Legacy location/contact resolutions target a different identity lane. Inserting
  the present deterministic resource IDs there would be an unsupported identity
  substitution.

## Boundary and interface

`luminari_resource_transcription_revision_v1` records append-only corrections and
retractions. Each correction binds the existing civic UID, object reference,
resource ID, run, artifact, source hash, candidate hash, locator and exact original
values. It retains the explicit reviewed Word span, quoted source text, review
ledger hash, reviewer and scope. The service-only writer has no update/delete
privilege. Triggers additionally reject update, delete and truncate.

`v_lighthouse_resource_program_transcribed_v1` preserves the existing catalog's
columns and adds `source_transcription_correction`. Readers can use its corrected
name/contact/transcription fields while presenting original values in provenance.
The underlying current resource must already have `person_facing_ready = true`.
No correction changes that flag, source readiness, jurisdiction, category, legal
authority, deadline or verification status. A changed source/candidate/run/locator
or original value disables the correction. Retractions append evidence and do not
reactivate older receipts. Two competing successors cannot fork the same chain.

The permitted fields are `name`, `organization_name`, `phone`, `email`,
`website_url`, `address`, `eligibility_summary`, `apply_notes` and `description`.
Changed non-null values must occur literally within the reviewed source span.
Explicit nulls may remove misplaced values. No whitespace rewriting or inference
is performed. Unchanged website URLs are not re-certified as part of a receipt.

## Prepared data and verification

The offline checker `scripts/prepare_resource_transcription_receipts.py` consumes
an explicitly authored packet and current rows. It checks the complete DOCX byte
hash, resolves only the given XPath coordinates, compares every quoted paragraph,
checks original values and preserves supplied identities. It neither discovers
records nor connects to a database.

The 24 prepared receipts are in
`docs/continuity/colorado-resource-transcription-receipts-20260914.json`. Their source
SHA-256 is `8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d`.
The exact bytes and fresh live projection snapshots were read for this review.
No remote mutation was performed.

Seven PostgreSQL/PGlite tests exercise actual migration behavior: limited correction,
immutable raw data and identity, exact/conflicting replay, unsupported fields/text,
stale versions/before values, publication holds, service/public permissions and
append-only retraction, including the complete SELECT/INSERT-only service-role
correction → successor → retraction lifecycle. Immutable predecessors and the unique
successor index prevent forks without a row lock requiring UPDATE permission.
Two additional tests execute the exact application SQL, including atomic rollback
after a forced post-insert failure. Three offline-checker tests reject changed bytes,
coordinates, quotes, original values and invented content. All 24 real prepared
receipts were also inserted into an isolated PGlite copy of the retrieved current
projection and checked against every unchanged original field. The local receipt
records the result. Production query performance and live publication have not
been tested by this track.

## Integration order

1. Review and apply the schema migration before deploying the resource reader
   that uses the new view. An empty ledger preserves existing catalog behavior.
2. Apply the reviewed transaction in
   `supabase/reviewed-data/20260914_colorado_resource_transcription.sql`. It is
   supplied separately from schema migrations so schema installation alone does
   not publish corrections. It validates all 24 current source bindings and
   original fields, then appends the exact payloads. Postconditions verify each
   corrected value, every unreviewed field, all base rows and receipt identity
   before commit. Exact replay is idempotent; stale or superseded receipts are
   rejected. The transaction uses the service role, serializable isolation, a
   packet advisory lock, a 3-second lock timeout and a 30-second statement bound.
3. Verify every corrected field, unchanged source/identity/verification state,
   list/detail agreement and source notice in the existing resource pages.
4. If review withdraws a correction, append `operation = 'retract'` with the latest
   revision as predecessor, the same source binding/original fields and empty
   `after_fields`. Do not mutate or delete its evidence.

The resources track owns list/detail integration and category/status display.
This track provides the database contract and source-bound receipts. No held
resource or dossier becomes public through this change.
