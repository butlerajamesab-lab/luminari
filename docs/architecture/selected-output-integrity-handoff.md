# Selected-runtime output integrity handoff

The supported read path is Rosetta's /api/live-rule/:sourceId -> Lighthouse's get_current_rosetta_live_detail -> human/report and integrity-inspection consumers. The publication observer exits while publication quarantine is active. The old V12-named admission proposal and retired current_source_result_evidence_v1 are not the selected runtime handoff.

## Paired change

Rosetta validates the received selected detail before sending it and adds output_integrity. Lighthouse independently performs the same validation on the unnormalized received payload. If the producer includes a receipt, any contradiction rejects. Neither end calls an invented certification route or changes admission, assembly, source ingestion, queue attempts, worker scope or publication.

Both repositories carry the same deterministic verifier source and the same six-source fixture. The source file blob hashes must match when reviewing the pair. A producer receipt is optional during the paired deployment transition: the consumer always verifies the current payload itself and never substitutes a legacy read or result. This is the same supported read path, not a fallback transport.

The verifier checks selected/installed engine and read identities, exact selector/source hash, decomposition identity, each raw span and its stored SHA-256, section containment/counts and layer-count consistency. It preserves R and other recorded evidence; it does not silently remap ontology. Source coordinates are PostgreSQL Unicode code-point offsets, with only requested boundaries retained to avoid a full character array for large documents.

The output digest binds canonical key-sorted source/runtime/output metadata and unit text hashes, including a hash of effective_text. The reader's effective_text remains a raw-span view with deletion masking; it is not asserted to equal internal clean classification text.

## Meaning of verified

The status verified means only the explicitly enumerated received-output integrity invariants passed. semantic_certification and publication_authorized are always false. The receipt does not authenticate original bytes, prove legal meaning, certify parent-child legal hierarchy, or authorize a Genome assembly. Missing failure-receipt exposure is explicitly false and is never described as verified absence.

Known summary leakage and hierarchy defects intentionally remain visible in the fixture and do not become certified by passing integrity checks. The full 30-responsibility matrix still needs authentic scope-specific validation and semantic certification.

## Evidence and acceptance

The fixture reconstructs canonical stored source and V13 output fields with SELECT-only database reads for the existing six sources, 72 units. Failure-receipt absence for this cohort was checked separately. This is not an export comparison, original-byte archive proof or independent legal gold labeling.

Tests cover all six sources, source/unit tampering, wrong runtime/read identity, mixed output identity, count/layer errors, Unicode offsets, holds/failures, absent failure exposure, producer/consumer digest agreement and contradictory producer receipts. The consumer integration tests execute its real TypeScript reader with mocked HTTP transport and the actual verifier, not a reimplementation. They prove one current-detail request per source with no certification-route request.

## Boundaries and next steps

- No SQL migration or production database write is part of this change.
- The guarded two-reader source-relation repair remains separately prepared. It does not reopen legacy function grants or certify the active handoff.
- No engine selection, decomposition run, provider request, worker activation or publication is triggered.
- Keep both sides under review together. Complete exact-head checks and independent review before any merge/deployment decision.
- Source preparation, post-decomposition semantic validators, bounded remedies and independent downstream admission remain required at their proper scopes. This change does not complete the entire matrix.

## Semantic continuation proposal

The [V-series semantic validation candidate contract](vseries-semantic-validation-contract.md) maps the historical semantic design into the retained matrix and defines source/output/validator identity, applicability, coverage and downstream acceptance requirements. Its reference manifest records the 26 supplied files. This is documentation for review; the semantic worker remains retired, and no semantic parser, policy, receipt writer or admission path is enabled by this addition.
