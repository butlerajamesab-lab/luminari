-- Live Supabase verification query snapshot for registry bucket custody/index PR.

-- Verify migration landed.
select version, name
from supabase_migrations.schema_migrations
where name = 'fix_registry_resources_unified_epoch_millis'
order by version desc
limit 1;

-- Verify timestamp fix.
select count(*) as bad_registry_created_at
from public.v_registry_resources_unified
where realm = 'registry_programs'
  and created_at > '2100-01-01'::timestamptz;

-- Verify resource projection count.
select realm, count(*) as rows
from public.v_registry_resources_unified
group by realm
order by realm;

-- Verify state bucket queue status.
select
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket') as queued_state_bucket,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and import_status = 'candidates_created') as candidates_created,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and import_status = 'pending_bucket_content_scan') as pending_scan,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and import_status = 'review_required') as review_required,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and sha256 is null) as missing_sha256,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and (raw_text is null or length(raw_text)=0)) as missing_raw_text,
  count(*) filter (where storage_bucket = 'State Enriched Registry bucket' and (normalized_text is null or length(normalized_text)=0)) as missing_normalized_text
from public.corpus_import_queue;
