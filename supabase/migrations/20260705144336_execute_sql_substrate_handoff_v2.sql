begin;

drop function if exists public.claim_corpus_import_queue_row(text, text, integer);

create function public.claim_corpus_import_queue_row(
  p_worker_id text,
  p_action text,
  p_lease_seconds integer default 300
)
returns setof public.corpus_import_queue
language sql
as $$
  with candidate as (
    select q.id
    from public.corpus_import_queue q
    where (q.lease_expires_at is null or q.lease_expires_at < now())
      and coalesce(q.import_status, '') not in ('completed', 'archived')
      and (
        case p_action
          when 'extract_docx_queue_row' then
            q.source_ext = '.docx'
            and q.import_status = 'pending_bucket_content_scan'
            and coalesce(char_length(q.raw_text), 0) = 0
          when 'normalize_docx_queue_row' then
            q.source_ext = '.docx'
            and q.import_status = 'pending_docx_normalization'
            and coalesce(char_length(q.raw_text), 0) > 0
          when 'execute_sql_substrate_handoff' then
            q.source_ext = '.sql'
            and q.import_status = 'pending_bucket_content_scan'
            and q.target_hint in ('cream_substrate_sql_handoff', 'full_substrate_sql_handoff')
            and q.storage_bucket is not null
            and q.storage_path is not null
          when 'route_corpus_queue_dry_run' then
            coalesce(q.dry_run, true) = true
            and q.import_status = 'pending_bucket_content_scan'
            and coalesce(q.source_ext, '') not in ('.docx', '.sql')
            and q.target_hint is not null
          else false
        end
      )
    order by
      coalesce(q.priority, 100) asc,
      q.updated_at asc nulls last,
      q.id asc
    limit 1
    for update skip locked
  )
  update public.corpus_import_queue q
  set
    leased_by = p_worker_id,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempt_count = coalesce(q.attempt_count, 0) + 1,
    worker_state = 'leased',
    last_transition_at = now(),
    updated_at = now()
  from candidate
  where q.id = candidate.id
  returning q.*;
$$;

create or replace function public.mark_sql_substrate_handoff_success(
  p_row_id bigint,
  p_worker_id text,
  p_sql_chars integer,
  p_cream_rows integer,
  p_operation_result_json jsonb default '{}'::jsonb
)
returns public.corpus_import_queue
language sql
as $$
  update public.corpus_import_queue
  set
    import_status = 'completed',
    storage_mode = 'sql_substrate_applied',
    dry_run = false,
    normalized_text_chars = coalesce(p_sql_chars, 0),
    record_count_estimate = coalesce(p_cream_rows, record_count_estimate),
    operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || p_operation_result_json,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_worker_action', 'execute_sql_substrate_handoff'),
    worker_state = 'completed_step',
    leased_by = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    last_transition_at = now(),
    updated_at = now()
  where id = p_row_id
    and leased_by = p_worker_id
    and source_ext = '.sql'
    and import_status = 'pending_bucket_content_scan'
  returning *;
$$;

update public.corpus_import_queue
set priority = case
  when source_ext = '.sql' and target_hint in ('cream_substrate_sql_handoff', 'full_substrate_sql_handoff') and import_status = 'pending_bucket_content_scan' then 5
  when source_ext = '.docx' and import_status = 'pending_bucket_content_scan' then 10
  when source_ext = '.docx' and import_status = 'pending_docx_normalization' then 20
  when import_status = 'pending_bucket_content_scan' and coalesce(source_ext, '') not in ('.docx', '.sql') then 100
  else priority
end
where import_status is not null;

commit;
