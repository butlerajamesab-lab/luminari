# PR Summary — Registry Bucket Custody Index

## What changed

This branch connects the already-live Lighthouse registry substrate to the resource projection surface.

### Database projection

- Adds `20260810073809_fix_registry_resources_unified_epoch_millis.sql`.
- Repairs `public.v_registry_resources_unified` timestamp normalization for `registry_programs.created_at`.
- Preserves source rows; no source-table mutation.

### Runtime projection

- Updates `server/routers/resource-directory-compat-router.ts`.
- Replaces the prior operational-surface placeholder response with rows from `public.v_registry_resources_unified`.
- Returns deterministic summary counts by projection realm.

### Documentation

- Adds live bucket findings.
- Adds next-action SQL probes.
- Records live execution status and remaining blockers.

## Live Supabase verification

Applied to Lighthouse project `wepxlinwbjrkqdzkqpar`:

```text
migration: 20260810073809 fix_registry_resources_unified_epoch_millis
result: success
```

Before:

```text
registry_programs rows with impossible future created_at values: 4,606
```

After:

```text
registry_programs rows with impossible future created_at values: 0
```

Current unified live resource projection:

```text
total: 11,871
registry_programs: 8,694
nonprofit_registry: 2,561
government_benefits_registry: 556
legal_aid_organizations: 60
```

## Remaining known blockers

- `corpus_artifact_manifest.source_sha256` remains empty for bucket artifacts.
- `corpus_artifact_manifest` parsed/staged/reconciled/promoted flags are not yet synchronized with promotion tables.
- 20 DOCX rows remain `pending_bucket_content_scan`.
- 11 DOCX rows remain `review_required` due to `storage_materialization_failed`.
- `sais_resources` remains empty.
- `registry_deadline_rules` remains empty.

## Non-goals

- No blind canonical promotion.
- No direct source-row mutation.
- No deletion of bucket artifacts.
- No SAIS promotion in this PR.
