-- Registry bucket staging audit v1
-- Read-only checks for Supabase Storage-sourced corpus_import_queue rows.
-- This script does not mutate canonical tables, doctrine_graph_edges, Atlas, RLS, security, or indexes.

begin;
set transaction read only;

select 'staged_rows_by_storage_bucket' as audit_section,
       coalesce(storage_bucket, '(missing)') as storage_bucket,
       count(*)::bigint as staged_rows
  from public.corpus_import_queue
 where source_type = 'supabase_storage'
    or storage_bucket is not null
 group by coalesce(storage_bucket, '(missing)')
 order by staged_rows desc, storage_bucket;

select 'staged_rows_by_source_ext' as audit_section,
       coalesce(source_ext, '(missing)') as source_ext,
       count(*)::bigint as staged_rows
  from public.corpus_import_queue
 where source_type = 'supabase_storage'
    or storage_bucket is not null
 group by coalesce(source_ext, '(missing)')
 order by staged_rows desc, source_ext;

select 'staged_rows_by_import_status' as audit_section,
       coalesce(import_status, '(missing)') as import_status,
       count(*)::bigint as staged_rows
  from public.corpus_import_queue
 where source_type = 'supabase_storage'
    or storage_bucket is not null
 group by coalesce(import_status, '(missing)')
 order by staged_rows desc, import_status;

select 'duplicate_risk_rows' as audit_section,
       id,
       source_name,
       storage_bucket,
       storage_path,
       sha256,
       import_status,
       payload -> 'duplicate_risk_reasons' as duplicate_risk_reasons,
       created_at
  from public.corpus_import_queue
 where (source_type = 'supabase_storage' or storage_bucket is not null)
   and (
        import_status ilike '%duplicate%'
        or coalesce((payload ->> 'duplicate_risk')::boolean, false)
        or exists (
          select 1
            from public.corpus_import_queue q2
           where q2.sha256 = public.corpus_import_queue.sha256
             and q2.id <> public.corpus_import_queue.id
        )
   )
 order by created_at desc nulls last
 limit 200;

select 'unreadable_rows' as audit_section,
       id,
       source_name,
       storage_bucket,
       storage_path,
       source_ext,
       import_status,
       payload ->> 'parse_error' as parse_error,
       created_at
  from public.corpus_import_queue
 where (source_type = 'supabase_storage' or storage_bucket is not null)
   and (
        import_status ilike '%unreadable%'
        or import_status ilike '%parse%'
        or payload ? 'parse_error'
   )
 order by created_at desc nulls last
 limit 200;

select 'target_hint_groups' as audit_section,
       coalesce(target_hint, '(missing)') as target_hint,
       count(*)::bigint as staged_rows,
       sum(coalesce(record_count_estimate, 0))::bigint as record_count_estimate_total
  from public.corpus_import_queue
 where source_type = 'supabase_storage'
    or storage_bucket is not null
 group by coalesce(target_hint, '(missing)')
 order by staged_rows desc, target_hint;

select 'record_count_estimate_totals' as audit_section,
       coalesce(storage_bucket, '(missing)') as storage_bucket,
       count(*)::bigint as staged_rows,
       sum(coalesce(record_count_estimate, 0))::bigint as record_count_estimate_total
  from public.corpus_import_queue
 where source_type = 'supabase_storage'
    or storage_bucket is not null
 group by coalesce(storage_bucket, '(missing)')
 order by record_count_estimate_total desc, staged_rows desc;

select 'missing_metadata_rows' as audit_section,
       id,
       source_name,
       storage_bucket,
       storage_path,
       source_ext,
       byte_size,
       sha256,
       content_type,
       storage_mode,
       target_hint,
       import_status,
       created_at
  from public.corpus_import_queue
 where (source_type = 'supabase_storage' or storage_bucket is not null)
   and (
        storage_bucket is null
        or storage_path is null
        or sha256 is null
        or source_ext is null
        or byte_size is null
        or storage_mode is null
        or target_hint is null
   )
 order by created_at desc nulls last
 limit 200;

select 'newest_staged_files' as audit_section,
       id,
       source_name,
       storage_bucket,
       storage_path,
       source_ext,
       byte_size,
       sha256,
       target_hint,
       record_count_estimate,
       import_status,
       created_at
  from public.corpus_import_queue
 where source_type = 'supabase_storage'
    or storage_bucket is not null
 order by created_at desc nulls last
 limit 100;

rollback;
