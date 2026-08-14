begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.docket_jurisdiction_activation_run (
  activation_id uuid primary key default gen_random_uuid(),
  state text not null check (state ~ '^[A-Z]{2}$'),
  session_id integer not null,
  session_title text,
  cache_fetched_at timestamptz not null,
  source text not null,
  bill_count integer not null check (bill_count >= 0),
  activation_state text not null default 'queued'
    check (activation_state in ('queued', 'processing', 'completed', 'degraded')),
  registered_bill_count integer not null default 0 check (registered_bill_count >= 0),
  completed_bill_count integer not null default 0 check (completed_bill_count >= 0),
  source_unavailable_count integer not null default 0 check (source_unavailable_count >= 0),
  failed_bill_count integer not null default 0 check (failed_bill_count >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint docket_jurisdiction_activation_run_unique
    unique (state, session_id, cache_fetched_at)
);

create index if not exists idx_docket_jurisdiction_activation_state
  on public.docket_jurisdiction_activation_run(state, cache_fetched_at desc);

create table if not exists public.docket_bill_processing_queue (
  queue_id uuid primary key default gen_random_uuid(),
  source_bill_id integer not null,
  summary_fingerprint text not null check (summary_fingerprint ~ '^[0-9a-f]{64}$'),
  summary_json jsonb not null,
  observed_change_hash text,
  queue_state text not null default 'eligible'
    check (queue_state in (
      'eligible',
      'submitted',
      'completed',
      'source_unavailable',
      'degraded',
      'permanent_failure'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_failure_class text,
  last_error_code text,
  receipt_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint docket_bill_processing_generation_unique
    unique (source_bill_id, summary_fingerprint)
);

create index if not exists idx_docket_bill_processing_queue_claim
  on public.docket_bill_processing_queue(
    queue_state,
    next_attempt_at,
    created_at
  );

create table if not exists public.docket_jurisdiction_activation_bill (
  activation_id uuid not null
    references public.docket_jurisdiction_activation_run(activation_id)
    on delete cascade,
  queue_id uuid not null
    references public.docket_bill_processing_queue(queue_id)
    on delete restrict,
  state text not null check (state ~ '^[A-Z]{2}$'),
  session_id integer not null,
  source_bill_id integer not null,
  created_at timestamptz not null default now(),
  primary key (activation_id, source_bill_id),
  constraint docket_jurisdiction_activation_bill_queue_unique
    unique (activation_id, queue_id)
);

create index if not exists idx_docket_jurisdiction_activation_bill_queue
  on public.docket_jurisdiction_activation_bill(queue_id, activation_id);

create or replace function public.refresh_docket_jurisdiction_activation_run(
  p_activation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_registered integer;
  v_completed integer;
  v_source_unavailable integer;
  v_failed integer;
  v_pending integer;
  v_processing integer;
begin
  select
    count(*)::integer,
    count(*) filter (where queue.queue_state = 'completed')::integer,
    count(*) filter (where queue.queue_state = 'source_unavailable')::integer,
    count(*) filter (where queue.queue_state = 'permanent_failure')::integer,
    count(*) filter (where queue.queue_state in ('eligible', 'submitted', 'degraded'))::integer,
    count(*) filter (where queue.queue_state in ('submitted', 'degraded'))::integer
  into
    v_registered,
    v_completed,
    v_source_unavailable,
    v_failed,
    v_pending,
    v_processing
  from public.docket_jurisdiction_activation_bill binding
  join public.docket_bill_processing_queue queue
    on queue.queue_id = binding.queue_id
  where binding.activation_id = p_activation_id;

  update public.docket_jurisdiction_activation_run activation
     set registered_bill_count = coalesce(v_registered, 0),
         completed_bill_count = coalesce(v_completed, 0),
         source_unavailable_count = coalesce(v_source_unavailable, 0),
         failed_bill_count = coalesce(v_failed, 0),
         activation_state = case
           when coalesce(v_registered, 0) = 0 then 'completed'
           when coalesce(v_pending, 0) = 0 and coalesce(v_failed, 0) > 0 then 'degraded'
           when coalesce(v_pending, 0) = 0 then 'completed'
           when coalesce(v_processing, 0) > 0
             or coalesce(v_completed, 0) > 0
             or coalesce(v_source_unavailable, 0) > 0
             then 'processing'
           else 'queued'
         end,
         completed_at = case
           when coalesce(v_registered, 0) = 0 or coalesce(v_pending, 0) = 0
             then coalesce(activation.completed_at, now())
           else null
         end,
         updated_at = now()
   where activation.activation_id = p_activation_id;
end;
$function$;

create or replace function public.refresh_docket_activation_for_queue()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_activation_id uuid;
begin
  for v_activation_id in
    select binding.activation_id
    from public.docket_jurisdiction_activation_bill binding
    where binding.queue_id = coalesce(new.queue_id, old.queue_id)
  loop
    perform public.refresh_docket_jurisdiction_activation_run(v_activation_id);
  end loop;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists docket_bill_processing_queue_refresh_activation
  on public.docket_bill_processing_queue;
create trigger docket_bill_processing_queue_refresh_activation
after update of queue_state on public.docket_bill_processing_queue
for each row
when (old.queue_state is distinct from new.queue_state)
execute function public.refresh_docket_activation_for_queue();

create or replace function public.refresh_docket_activation_after_binding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.refresh_docket_jurisdiction_activation_run(new.activation_id);
  return new;
end;
$function$;

drop trigger if exists docket_jurisdiction_activation_bill_refresh_run
  on public.docket_jurisdiction_activation_bill;
create trigger docket_jurisdiction_activation_bill_refresh_run
after insert on public.docket_jurisdiction_activation_bill
for each row execute function public.refresh_docket_activation_after_binding();

create or replace function public.register_docket_jurisdiction_activation(
  p_state text,
  p_session_id integer,
  p_session_title text,
  p_bills jsonb,
  p_bill_count integer,
  p_cache_fetched_at timestamptz,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_activation_id uuid;
  v_bill jsonb;
  v_source_bill_id integer;
  v_summary_fingerprint text;
  v_queue_id uuid;
begin
  if p_state is null or p_state !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_state';
  end if;
  if p_session_id is null or p_session_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_session';
  end if;
  if p_cache_fetched_at is null then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_fetched_at';
  end if;
  if jsonb_typeof(coalesce(p_bills, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_bills';
  end if;

  insert into public.docket_jurisdiction_activation_run (
    state,
    session_id,
    session_title,
    cache_fetched_at,
    source,
    bill_count
  ) values (
    p_state,
    p_session_id,
    p_session_title,
    p_cache_fetched_at,
    coalesce(nullif(p_source, ''), 'docket_state_cache'),
    greatest(coalesce(p_bill_count, jsonb_array_length(coalesce(p_bills, '[]'::jsonb))), 0)
  )
  on conflict (state, session_id, cache_fetched_at) do update
  set session_title = excluded.session_title,
      source = excluded.source,
      bill_count = excluded.bill_count,
      updated_at = now()
  returning activation_id into v_activation_id;

  for v_bill in
    select item.value
    from jsonb_array_elements(coalesce(p_bills, '[]'::jsonb)) item(value)
  loop
    v_source_bill_id := case
      when coalesce(v_bill ->> 'bill_id', '') ~ '^[0-9]+$'
        then (v_bill ->> 'bill_id')::integer
      else null
    end;
    if v_source_bill_id is null or v_source_bill_id <= 0 then
      continue;
    end if;

    v_summary_fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'state', p_state,
            'session_id', p_session_id,
            'source_bill_id', v_source_bill_id,
            'summary', v_bill
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.docket_bill_processing_queue (
      source_bill_id,
      summary_fingerprint,
      summary_json,
      observed_change_hash
    ) values (
      v_source_bill_id,
      v_summary_fingerprint,
      v_bill,
      nullif(v_bill ->> 'change_hash', '')
    )
    on conflict (source_bill_id, summary_fingerprint) do update
    set summary_json = excluded.summary_json,
        observed_change_hash = excluded.observed_change_hash,
        updated_at = now()
    returning queue_id into v_queue_id;

    insert into public.docket_jurisdiction_activation_bill (
      activation_id,
      queue_id,
      state,
      session_id,
      source_bill_id
    ) values (
      v_activation_id,
      v_queue_id,
      p_state,
      p_session_id,
      v_source_bill_id
    )
    on conflict (activation_id, source_bill_id) do nothing;
  end loop;

  perform public.refresh_docket_jurisdiction_activation_run(v_activation_id);
  return v_activation_id;
end;
$function$;

create or replace function public.enqueue_docket_state_cache_activation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.register_docket_jurisdiction_activation(
    new.state,
    new.session_id,
    new.session_title,
    new.bills,
    new.bill_count,
    new.fetched_at,
    new.source
  );
  return new;
end;
$function$;

drop trigger if exists docket_state_cache_enqueue_activation
  on public.docket_bill_state_cache;
create trigger docket_state_cache_enqueue_activation
after insert or update of bills, fetched_at
on public.docket_bill_state_cache
for each row
when (new.session_id is not null and new.fetched_at is not null)
execute function public.enqueue_docket_state_cache_activation();

-- Backfill the currently cached jurisdictions once. This creates durable work
-- only for the exact cached bill-summary generations; unchanged future cache
-- reads do not write and therefore do not create duplicate activations.
do $backfill$
declare
  v_cache record;
begin
  for v_cache in
    select state, session_id, session_title, bills, bill_count, fetched_at, source
    from public.docket_bill_state_cache
    order by state
  loop
    perform public.register_docket_jurisdiction_activation(
      v_cache.state,
      v_cache.session_id,
      v_cache.session_title,
      v_cache.bills,
      v_cache.bill_count,
      v_cache.fetched_at,
      v_cache.source
    );
  end loop;
end;
$backfill$;

alter table public.docket_jurisdiction_activation_run enable row level security;
alter table public.docket_jurisdiction_activation_run force row level security;
alter table public.docket_bill_processing_queue enable row level security;
alter table public.docket_bill_processing_queue force row level security;
alter table public.docket_jurisdiction_activation_bill enable row level security;
alter table public.docket_jurisdiction_activation_bill force row level security;

revoke all on table public.docket_jurisdiction_activation_run from public, anon, authenticated;
revoke all on table public.docket_bill_processing_queue from public, anon, authenticated;
revoke all on table public.docket_jurisdiction_activation_bill from public, anon, authenticated;
grant select, insert, update, delete on table public.docket_jurisdiction_activation_run to service_role;
grant select, insert, update, delete on table public.docket_bill_processing_queue to service_role;
grant select, insert, update, delete on table public.docket_jurisdiction_activation_bill to service_role;

revoke all on function public.register_docket_jurisdiction_activation(text, integer, text, jsonb, integer, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.refresh_docket_jurisdiction_activation_run(uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_docket_activation_for_queue()
  from public, anon, authenticated;
revoke all on function public.refresh_docket_activation_after_binding()
  from public, anon, authenticated;
revoke all on function public.enqueue_docket_state_cache_activation()
  from public, anon, authenticated;
grant execute on function public.register_docket_jurisdiction_activation(text, integer, text, jsonb, integer, timestamptz, text)
  to service_role;
grant execute on function public.refresh_docket_jurisdiction_activation_run(uuid)
  to service_role;

comment on table public.docket_jurisdiction_activation_run is
  'One immutable jurisdiction/session cache generation activation. Opening or refreshing a jurisdiction registers its exact cached bill set without blocking the user response.';
comment on table public.docket_bill_processing_queue is
  'Deduplicated pre-Rosetta queue that retrieves exact bill detail and registers every official text and amendment into the existing legislative-version decomposition spine.';
comment on function public.register_docket_jurisdiction_activation(text, integer, text, jsonb, integer, timestamptz, text) is
  'Registers one jurisdiction cache generation and deduplicated bill-detail work. It does not perform source retrieval, Rosetta extraction, Genome assembly, or Prism verification inline.';

commit;

