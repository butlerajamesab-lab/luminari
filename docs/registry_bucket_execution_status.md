# Registry Bucket Execution Status

## Completed in this branch

- Created branch `agent/lighthouse-registry-bucket-custody-index` from `main`.
- Added Supabase migration `20260810073500_fix_registry_resources_unified_epoch_millis.sql`.
- Updated `server/routers/resource-directory-compat-router.ts` so `resources.getResources` reads the live registry projection.
- Added live findings and next-action SQL probes.

## Completed in live Lighthouse Supabase

- Applied migration `fix_registry_resources_unified_epoch_millis`.
- Verified `v_registry_resources_unified` no longer produces impossible future timestamps for `registry_programs` rows.

Before fix:

```text
bad_registry_created_at: 4606
```

After fix:

```text
bad_registry_created_at: 0
```

## Current live resource projection

```text
v_registry_resources_unified total: 11,871
registry_programs: 8,694
nonprofit_registry: 2,561
government_benefits_registry: 556
legal_aid_organizations: 60
```

## Current live registry substrate status

- The Lighthouse Supabase storage bucket `State Enriched Registry bucket` exists and contains 137 objects.
- `Everything backbone related` exists and contains 17 objects.
- `v3_13_full_substrate_ingest.sql` has already completed a staging-only SQL substrate handoff as queue row `271`.
- That handoff validated 36,876 observed records across 20 target tables.
- The current display problem is no longer “no data.” The visible resource route was reading a placeholder operational surface rather than the live unified registry projection.

## Remaining blockers

- 20 `.docx` state-bucket queue rows remain `pending_bucket_content_scan`.
- 11 `.docx` rows remain `review_required` due to `storage_materialization_failed`.
- Two old SQL queue rows remain `review_required` from the prior Node 20 runtime failure, but queue row `271` completed the v3.13 full substrate handoff later.
- `corpus_artifact_manifest.source_sha256` remains empty for all state-bucket manifest rows.
- `sais_resources` has zero rows.
- `registry_deadline_rules` has zero rows.

## Next safe execution lane

1. Deploy/merge the resource projection router change so `/resources` surfaces the 11,871-row live projection.
2. Repair the stalled storage materialization queue rows.
3. Populate artifact-manifest custody hashes from deterministic downloaded object content, not from ETags.
4. Reconcile manifest staged/reconciled/promoted flags against the actual completed promotion tables.
5. Register SAIS resources and deadline/routing artifacts through the same promotion-receipt pattern.
