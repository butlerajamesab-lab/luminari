# Registry Bucket Remaining Blockers

The source corpus is present and partially promoted, but not fully reconciled into every Lighthouse surface.

## Remaining blockers observed live

```text
corpus_artifact_manifest.source_sha256 missing for state bucket: 137/137
corpus_artifact_manifest staged/reconciled/promoted flags for state bucket: 0/137
corpus_import_queue pending_bucket_content_scan for state bucket: 22
corpus_import_queue review_required for state bucket: 11
sais_resources: 0
registry_deadline_rules: 0
```

## Correct follow-up branch

```text
agent/lighthouse-registry-custody-hash-and-staging-reconciliation
```

## Follow-up scope

1. Materialize remaining 33 source objects with missing raw/normalized text.
2. Compute true content SHA-256 values from object bytes, not ETags.
3. Backfill `corpus_artifact_manifest.source_sha256`.
4. Reconcile manifest state flags from actual staging and promotion tables.
5. Populate SAIS and deadline lanes through receipt-bound promotion.
