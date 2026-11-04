-- DISPOSABLE CI DATABASE ONLY. Not a production migration.
-- This fixture proves actual Node/TypeScript Docket transport and queue
-- wiring against PostgreSQL. The two registration functions below are
-- explicitly isolated stubs; this does NOT certify canonical SQL semantics,
-- Genome projection, source bytes, Rosetta, or production admission.
do $$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table public.docket_bill_detail_cache (
  bill_id integer primary key, bill jsonb not null,
  fetched_at timestamptz not null, source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.docket_bill_state_cache (
  state text primary key, session_id integer, fetched_at timestamptz,
  bills jsonb not null default '[]'::jsonb
);
create table public.docket_bill_processing_queue (
  queue_id uuid primary key default gen_random_uuid(),
  source_bill_id integer not null,
  queue_state text not null default 'eligible',
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz, locked_by text,
  summary_fingerprint text not null default repeat('a',64),
  observed_change_hash text, attempt_count integer not null default 0,
  receipt_json jsonb not null default '{}'::jsonb,
  completed_at timestamptz, last_failure_class text, last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.docket_jurisdiction_activation_run (
  activation_id uuid primary key default gen_random_uuid(),
  state text not null, session_id integer not null,
  source text not null, cache_fetched_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.docket_jurisdiction_activation_bill (
  queue_id uuid not null references public.docket_bill_processing_queue(queue_id),
  activation_id uuid not null references public.docket_jurisdiction_activation_run(activation_id),
  source_bill_id integer not null, state text not null, session_id integer not null,
  primary key(queue_id,activation_id)
);
create table public.civic_genome_bill (
  structural_dna_json jsonb not null
);

-- TEST-ONLY: returns exact queue/binding records to the existing caller.
-- A separate disposable Supabase Preview proof tests the real production
-- register_docket_jurisdiction_activation function.
create function public.register_docket_jurisdiction_activation(
  p_state text,p_session_id integer,p_context text,p_bills jsonb,
  p_limit integer,p_fetched_at timestamptz,p_source text
) returns uuid language plpgsql as $fn$
declare
  v_activation uuid := gen_random_uuid();
  v_queue uuid;
  v_bill jsonb;
  v_bill_id integer;
begin
  insert into public.docket_jurisdiction_activation_run(
    activation_id,state,session_id,source,cache_fetched_at
  ) values(v_activation,p_state,p_session_id,p_source,p_fetched_at);
  for v_bill in select value from jsonb_array_elements(p_bills) value loop
    v_bill_id := (v_bill->>'bill_id')::integer;
    insert into public.docket_bill_processing_queue(
      source_bill_id,queue_state,observed_change_hash
    ) values(v_bill_id,'eligible',v_bill->>'change_hash') returning queue_id into v_queue;
    insert into public.docket_jurisdiction_activation_bill(
      queue_id,activation_id,source_bill_id,state,session_id
    ) values(v_queue,v_activation,v_bill_id,p_state,p_session_id);
  end loop;
  return v_activation;
end $fn$;

-- TEST-ONLY downstream registration stub. It verifies Docket's call path,
-- not the actual Civic Genome version-spine implementation.
create function public.register_docket_legislative_version_spine(
  p_bill_id integer,p_publish boolean
) returns jsonb language sql as $fn$
select jsonb_build_object(
  'source_bill_id',p_bill_id,
  'genome_bill_id','22222222-2222-4222-8222-222222222222',
  'registered_document_count',1,'text_version_count',1,
  'amendment_count',0,'matched_amendment_base_count',0,
  'queued_or_refreshed_count',1,
  'docket_fetched_at',now()::text
)
$fn$;
