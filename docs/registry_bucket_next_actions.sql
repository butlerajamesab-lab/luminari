-- Registry bucket next-action probes.
-- Read-only unless explicitly noted.

-- 1. Remaining state-bucket queue blockers.
select
  import_status,
  source_ext,
  target_hint,
  count(*) as rows,
  sum(attempt_count) as attempts,
  max(attempt_count) as max_attempt_count,
  count(*) filter (where last_error_code is not null) as rows_with_error
from public.corpus_import_queue
group by import_status, source_ext, target_hint
order by import_status, source_ext, target_hint;

-- 2. State bucket queue/materialization coverage.
select
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket') as queued_state_bucket,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and import_status = 'candidates_created') as candidates_created,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and import_status = 'pending_bucket_content_scan') as pending_scan,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and import_status = 'review_required') as review_required,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and sha256 is null) as missing_sha256,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and (raw_text is null or length(raw_text)=0)) as missing_raw_text,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and (normalized_text is null or length(normalized_text)=0)) as missing_normalized_text
from public.corpus_import_queue;

-- 3. Artifact manifest custody coverage.
select
  bucket_id,
  count(*) as manifest_rows,
  count(*) filter (where source_sha256 is null) as missing_manifest_sha256,
  count(*) filter (where parsed) as parsed,
  count(*) filter (where staged) as staged,
  count(*) filter (where reconciled) as reconciled,
  count(*) filter (where promoted) as promoted
from public.corpus_artifact_manifest
group by bucket_id
order by manifest_rows desc;

-- 4. Live resource projection counts.
select
  realm,
  count(*) as rows
from public.v_registry_resources_unified
group by realm
order by realm;

-- 5. Impossible future timestamp guard after epoch-millisecond fix.
select count(*) as bad_registry_created_at
from public.v_registry_resources_unified
where realm = 'registry_programs'
  and created_at > '2100-01-01'::timestamptz;
