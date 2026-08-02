begin;

alter table public.corpus_import_queue
  add column if not exists priority integer not null default 100,
  add column if not exists leased_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists worker_state text,
  add column if not exists last_transition_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists dry_run boolean not null default true,
  add column if not exists operation_result_json jsonb not null default '{}'::jsonb,
  add column if not exists normalized_text text,
  add column if not exists normalized_text_chars integer not null default 0;

create index if not exists corpus_import_queue_claim_idx
  on public.corpus_import_queue (import_status, source_ext, priority, updated_at, id)
  where import_status is not null;

create index if not exists corpus_import_queue_lease_idx
  on public.corpus_import_queue (lease_expires_at)
  where lease_expires_at is not null;

create index if not exists corpus_import_queue_worker_state_idx
  on public.corpus_import_queue (worker_state, last_error_code, import_status);

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
          when 'route_corpus_queue_dry_run' then
            coalesce(q.dry_run, true) = true
            and q.import_status = 'pending_bucket_content_scan'
            and coalesce(q.source_ext, '') <> '.docx'
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

create or replace function public.heartbeat_corpus_import_queue_row(
  p_row_id bigint,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns boolean
language sql
as $$
  update public.corpus_import_queue
  set
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where id = p_row_id
    and leased_by = p_worker_id
  returning true;
$$;

create or replace function public.mark_extract_docx_success(
  p_row_id bigint,
  p_worker_id text,
  p_raw_text text,
  p_operation_result_json jsonb default '{}'::jsonb
)
returns public.corpus_import_queue
language sql
as $$
  update public.corpus_import_queue
  set
    import_status = 'pending_docx_normalization',
    storage_mode = 'compressed_raw_text',
    raw_text = p_raw_text,
    record_count_estimate = greatest(1, array_length(regexp_split_to_array(coalesce(p_raw_text, ''), E'\\n+'), 1)),
    operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || p_operation_result_json,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_worker_action', 'extract_docx_queue_row'),
    worker_state = 'completed_step',
    leased_by = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    last_transition_at = now(),
    updated_at = now()
  where id = p_row_id
    and leased_by = p_worker_id
    and source_ext = '.docx'
    and import_status = 'pending_bucket_content_scan'
  returning *;
$$;

create or replace function public.mark_normalize_docx_success(
  p_row_id bigint,
  p_worker_id text,
  p_normalized_text text,
  p_operation_result_json jsonb default '{}'::jsonb
)
returns public.corpus_import_queue
language sql
as $$
  update public.corpus_import_queue
  set
    import_status = 'ready_for_review',
    normalized_text = p_normalized_text,
    normalized_text_chars = char_length(coalesce(p_normalized_text, '')),
    operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || p_operation_result_json,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_worker_action', 'normalize_docx_queue_row'),
    worker_state = 'completed_step',
    leased_by = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    last_transition_at = now(),
    updated_at = now()
  where id = p_row_id
    and leased_by = p_worker_id
    and source_ext = '.docx'
    and import_status = 'pending_docx_normalization'
  returning *;
$$;

create or replace function public.mark_route_dry_run_success(
  p_row_id bigint,
  p_worker_id text,
  p_route_plan jsonb
)
returns public.corpus_import_queue
language sql
as $$
  update public.corpus_import_queue
  set
    operation_result_json = coalesce(operation_result_json, '{}'::jsonb)
      || jsonb_build_object(
        'last_dry_run_at', now(),
        'dry_run_plan', p_route_plan
      ),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_worker_action', 'route_corpus_queue_dry_run'),
    worker_state = 'dry_run_completed',
    leased_by = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    last_transition_at = now(),
    updated_at = now()
  where id = p_row_id
    and leased_by = p_worker_id
  returning *;
$$;

create or replace function public.mark_corpus_import_queue_failure(
  p_row_id bigint,
  p_worker_id text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true,
  p_operation_result_json jsonb default '{}'::jsonb
)
returns public.corpus_import_queue
language sql
as $$
  update public.corpus_import_queue
  set
    import_status = case when p_retryable then import_status else 'review_required' end,
    last_error_code = p_error_code,
    last_error_message = left(p_error_message, 4000),
    operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || p_operation_result_json,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'last_worker_failure_code', p_error_code,
      'last_worker_failure_at', now()
    ),
    worker_state = case when p_retryable then 'failed_retryable' else 'failed_terminal' end,
    leased_by = null,
    lease_expires_at = null,
    last_transition_at = now(),
    updated_at = now()
  where id = p_row_id
    and leased_by = p_worker_id
  returning *;
$$;

update public.corpus_import_queue
set priority = case
  when source_ext = '.docx' and import_status = 'pending_bucket_content_scan' then 10
  when source_ext = '.docx' and import_status = 'pending_docx_normalization' then 20
  when import_status = 'pending_bucket_content_scan' and coalesce(source_ext, '') <> '.docx' then 100
  else priority
end
where import_status is not null;

commit;
