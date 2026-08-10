# Registry Bucket Cutover Checklist

## Pre-merge

- Confirm Supabase migration ledger includes `20260810073809 fix_registry_resources_unified_epoch_millis`.
- Confirm `bad_registry_created_at = 0` from `docs/registry_bucket_next_actions.sql`.
- Confirm `v_registry_resources_unified` returns 11,871 rows.
- Confirm code review accepts that source rows are not mutated.

## Merge/deploy

- Merge branch `agent/lighthouse-registry-bucket-custody-index` into `main`.
- Allow Render auto-deploy if Lighthouse service is configured for auto deploy.
- Do not manually trigger deploy unless auto deploy is disabled or no deploy occurs.

## Post-deploy runtime check

- Hit `/api/health`.
- Open resource directory surface.
- Confirm `resources.getResources` returns live registry resources, not only the old operational placeholders.
- Confirm response summary includes:

```text
source: v_registry_resources_unified
total_resources: 11871
returned_resources: 500
projection_state: live_registry_resource_projection
```

## Next PR after this

- Repair stalled corpus materialization rows.
- Deterministically populate artifact SHA-256 values from object content.
- Reconcile artifact manifest flags with actual promotion tables.
- Populate `registry_deadline_rules` and `sais_resources` through governed promotion receipts.
