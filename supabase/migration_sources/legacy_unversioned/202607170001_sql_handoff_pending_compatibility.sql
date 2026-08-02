begin;

create or replace function public.claim_corpus_import_queue_row(
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
            and q.import_status in ('pending_bucket_content_scan', 'pending')
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
    import_status = case
      when p_action = 'execute_sql_substrate_handoff' and q.import_status = 'pending' then 'pending_bucket_content_scan'
      else q.import_status
    end,
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

update public.corpus_import_queue
set priority = case
  when source_ext = '.sql' and target_hint in ('cream_substrate_sql_handoff', 'full_substrate_sql_handoff') and import_status in ('pending_bucket_content_scan', 'pending') then 5
  when source_ext = '.docx' and import_status = 'pending_bucket_content_scan' then 10
  when source_ext = '.docx' and import_status = 'pending_docx_normalization' then 20
  when import_status = 'pending_bucket_content_scan' and coalesce(source_ext, '') not in ('.docx', '.sql') then 100
  else priority
end
where import_status is not null;

commit;
