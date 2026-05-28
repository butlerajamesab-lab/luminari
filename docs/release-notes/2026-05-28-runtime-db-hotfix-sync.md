# 2026-05-28 — Runtime DB hotfix sync

## Summary
- Synced repository migrations with production-applied runtime DB hotfixes for enforcement tallies and compatibility views.
- Added verification SQL to enforce required runtime objects/columns and non-empty smoke checks.
- Added CI schema guardrails to apply migrations on a fresh Postgres instance and fail fast on contract drift.

## Included compatibility behavior
- `public.detected_signals_base` includes both `created_at` and compatibility alias `"createdAt"`.
- `public.entities` includes nullable `legacy_relation_id`.
- `compat.v_enforcement_record_tallies` passthrough remains available.

## Deferred
- Physical schema renames such as `workflowId -> workflow_id` remain deferred by design.
