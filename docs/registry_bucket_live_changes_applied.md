# Live Changes Applied

## Supabase production

Applied migration:

```text
20260810073809 fix_registry_resources_unified_epoch_millis
```

Verified:

```text
bad registry_programs resource projection timestamps after 2100: 0
```

## GitHub branch

```text
agent/lighthouse-registry-bucket-custody-index
```

Purpose:

```text
Expose already-promoted registry resources through the Lighthouse resources surface and document the remaining storage/materialization/promotion blockers.
```
