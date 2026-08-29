-- Internal, append-only claim/intake substrate for source-reviewed claim catalogs.
--
-- This is intentionally separate from Resource Directory situation actions. An
-- intake option is not a person-facing service route. Only records explicitly
-- typed as direct_resource or direct_resource_binding may be considered by a
-- later, separate publication gate. This migration itself publishes nothing.

create table if not exists public.luminari_claim_intake_package_v1 (
  package_id uuid primary key,
  source_filename text not null,
  source_content_sha256 text not null,
  manual_review_ledger_sha256 text not null,
  adapter_version text not null,
  package_receipt_sha256 text not null,
  expected_item_count integer not null,
  expected_kind_counts jsonb not null,
  package_metadata jsonb not null,
  created_at timestamptz not null default now(),
  constraint luminari_claim_intake_package_text_check check (
    nullif(btrim(source_filename), '') is not null
    and nullif(btrim(adapter_version), '') is not null
  ),
  constraint luminari_claim_intake_package_hash_check check (
    source_content_sha256 ~ '^[0-9a-f]{64}$'
    and manual_review_ledger_sha256 ~ '^[0-9a-f]{64}$'
    and package_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint luminari_claim_intake_package_count_check check (
    expected_item_count > 0
    and jsonb_typeof(expected_kind_counts) = 'object'
    and jsonb_typeof(package_metadata) = 'object'
  ),
  unique (source_content_sha256, manual_review_ledger_sha256, adapter_version)
);

create table if not exists public.luminari_claim_intake_item_revision_v1 (
  item_revision_id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.luminari_claim_intake_package_v1(package_id) on delete restrict,
  item_kind text not null,
  item_key text not null,
  item_revision_key text not null,
  claim_id text,
  state_code text,
  access_state text not null,
  visibility_state text not null,
  requires_separate_publication_gate boolean not null,
  source_pages integer[] not null,
  direct_source_reference text not null,
  record_payload_sha256 text not null,
  record_payload jsonb not null,
  field_provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique (package_id, item_kind, item_key),
  constraint luminari_claim_intake_item_kind_check check (item_kind in (
    'claim_identity',
    'intake_option',
    'structural_barrier',
    'legal_authority_linkage',
    'enforcement_role_linkage',
    'year_context_note',
    'claim_alias',
    'claim_intersection',
    'cross_lens_binding',
    'direct_resource',
    'direct_resource_binding'
  )),
  constraint luminari_claim_intake_item_key_check check (
    nullif(btrim(item_key), '') is not null
    and item_revision_key ~ '^[0-9a-f]{64}$'
    and record_payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint luminari_claim_intake_item_source_check check (
    cardinality(source_pages) > 0
    and array_position(source_pages, null) is null
    and 0 < all (source_pages)
    and nullif(btrim(direct_source_reference), '') is not null
    and jsonb_typeof(record_payload) = 'object'
    and jsonb_typeof(field_provenance) = 'object'
  ),
  constraint luminari_claim_intake_item_access_check check (access_state in (
    'intake_internal', 'service_only', 'person_facing_candidate'
  )),
  constraint luminari_claim_intake_item_visibility_check check (visibility_state in (
    'intake_candidate', 'service_only', 'review_hold',
    'separately_gated_person_facing_candidate'
  )),
  constraint luminari_claim_intake_item_lane_check check (
    case
      when item_kind = 'intake_option' then
        access_state = 'intake_internal'
        and visibility_state = 'intake_candidate'
        and not requires_separate_publication_gate
        and nullif(btrim(state_code), '') is not null
      when item_kind in ('direct_resource', 'direct_resource_binding') then
        access_state = 'person_facing_candidate'
        and visibility_state = 'separately_gated_person_facing_candidate'
        and requires_separate_publication_gate
        and coalesce(
          nullif(btrim(record_payload->>'website'), ''),
          nullif(btrim(record_payload->>'phone'), '')
        ) is not null
      when item_kind = 'claim_identity' then
        access_state = 'intake_internal'
        and visibility_state in ('intake_candidate', 'review_hold')
        and not requires_separate_publication_gate
        and nullif(btrim(state_code), '') is not null
      else
        access_state = 'service_only'
        and visibility_state in ('service_only', 'review_hold')
        and requires_separate_publication_gate
    end
  )
);

create table if not exists public.luminari_claim_intake_activation_v1 (
  activation_id uuid primary key,
  package_id uuid not null unique
    references public.luminari_claim_intake_package_v1(package_id) on delete restrict,
  source_filename text not null,
  activation_receipt_sha256 text not null,
  activation_receipt jsonb not null,
  activated_at timestamptz not null default now(),
  constraint luminari_claim_intake_activation_hash_check check (
    activation_receipt_sha256 ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(activation_receipt) = 'object'
  ),
  constraint luminari_claim_intake_activation_filename_check check (
    nullif(btrim(source_filename), '') is not null
  )
);

create index if not exists luminari_claim_intake_item_package_kind_idx
  on public.luminari_claim_intake_item_revision_v1 (package_id, item_kind, item_key);
create index if not exists luminari_claim_intake_item_claim_idx
  on public.luminari_claim_intake_item_revision_v1 (claim_id, item_kind, package_id);
create index if not exists luminari_claim_intake_item_visibility_idx
  on public.luminari_claim_intake_item_revision_v1
  (access_state, visibility_state, item_kind, package_id);
create index if not exists luminari_claim_intake_item_pages_idx
  on public.luminari_claim_intake_item_revision_v1 using gin (source_pages);
create index if not exists luminari_claim_intake_activation_source_idx
  on public.luminari_claim_intake_activation_v1
  (source_filename, activated_at desc, activation_id desc);

alter table public.luminari_claim_intake_package_v1 enable row level security;
alter table public.luminari_claim_intake_item_revision_v1 enable row level security;
alter table public.luminari_claim_intake_activation_v1 enable row level security;

revoke all on public.luminari_claim_intake_package_v1
  from public, anon, authenticated, service_role;
revoke all on public.luminari_claim_intake_item_revision_v1
  from public, anon, authenticated, service_role;
revoke all on public.luminari_claim_intake_activation_v1
  from public, anon, authenticated, service_role;

do $claim_intake_policies$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='luminari_claim_intake_package_v1'
      and policyname='luminari_claim_intake_package_service_select_v1'
  ) then
    execute 'create policy luminari_claim_intake_package_service_select_v1 on public.luminari_claim_intake_package_v1 for select to service_role using (true)';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='luminari_claim_intake_package_v1'
      and policyname='luminari_claim_intake_package_service_insert_v1'
  ) then
    execute 'create policy luminari_claim_intake_package_service_insert_v1 on public.luminari_claim_intake_package_v1 for insert to service_role with check (true)';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='luminari_claim_intake_item_revision_v1'
      and policyname='luminari_claim_intake_item_service_select_v1'
  ) then
    execute 'create policy luminari_claim_intake_item_service_select_v1 on public.luminari_claim_intake_item_revision_v1 for select to service_role using (true)';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='luminari_claim_intake_item_revision_v1'
      and policyname='luminari_claim_intake_item_service_insert_v1'
  ) then
    execute 'create policy luminari_claim_intake_item_service_insert_v1 on public.luminari_claim_intake_item_revision_v1 for insert to service_role with check (true)';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='luminari_claim_intake_activation_v1'
      and policyname='luminari_claim_intake_activation_service_select_v1'
  ) then
    execute 'create policy luminari_claim_intake_activation_service_select_v1 on public.luminari_claim_intake_activation_v1 for select to service_role using (true)';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='luminari_claim_intake_activation_v1'
      and policyname='luminari_claim_intake_activation_service_insert_v1'
  ) then
    execute 'create policy luminari_claim_intake_activation_service_insert_v1 on public.luminari_claim_intake_activation_v1 for insert to service_role with check (true)';
  end if;
end;
$claim_intake_policies$;

grant select, insert on public.luminari_claim_intake_package_v1 to service_role;
grant select, insert on public.luminari_claim_intake_item_revision_v1 to service_role;
grant select, insert on public.luminari_claim_intake_activation_v1 to service_role;

create or replace function public.register_luminari_claim_intake_package_v1(
  p_package jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_package_id uuid := nullif(btrim(p_package->>'package_id'), '')::uuid;
  v_existing public.luminari_claim_intake_package_v1%rowtype;
begin
  if jsonb_typeof(p_package) is distinct from 'object'
     or nullif(btrim(p_package->>'source_filename'), '') is null
     or coalesce(p_package->>'source_content_sha256', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_package->>'manual_review_ledger_sha256', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_package->>'package_receipt_sha256', '') !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_package->>'adapter_version'), '') is null
     or coalesce((p_package->>'expected_item_count')::integer, 0) <= 0
     or jsonb_typeof(p_package->'expected_kind_counts') is distinct from 'object'
     or jsonb_typeof(p_package->'package_metadata') is distinct from 'object' then
    raise exception 'invalid claim/intake package registration';
  end if;

  insert into public.luminari_claim_intake_package_v1 (
    package_id, source_filename, source_content_sha256,
    manual_review_ledger_sha256, adapter_version,
    package_receipt_sha256, expected_item_count,
    expected_kind_counts, package_metadata
  ) values (
    v_package_id, btrim(p_package->>'source_filename'),
    p_package->>'source_content_sha256',
    p_package->>'manual_review_ledger_sha256',
    btrim(p_package->>'adapter_version'),
    p_package->>'package_receipt_sha256',
    (p_package->>'expected_item_count')::integer,
    p_package->'expected_kind_counts', p_package->'package_metadata'
  ) on conflict (package_id) do nothing;

  select * into strict v_existing
  from public.luminari_claim_intake_package_v1
  where package_id = v_package_id;

  if v_existing.source_filename is distinct from btrim(p_package->>'source_filename')
     or v_existing.source_content_sha256 is distinct from p_package->>'source_content_sha256'
     or v_existing.manual_review_ledger_sha256 is distinct from p_package->>'manual_review_ledger_sha256'
     or v_existing.adapter_version is distinct from btrim(p_package->>'adapter_version')
     or v_existing.package_receipt_sha256 is distinct from p_package->>'package_receipt_sha256'
     or v_existing.expected_item_count is distinct from (p_package->>'expected_item_count')::integer
     or v_existing.expected_kind_counts is distinct from p_package->'expected_kind_counts'
     or v_existing.package_metadata is distinct from p_package->'package_metadata' then
    raise exception 'claim/intake package id was reused with different content: %', v_package_id;
  end if;

  return jsonb_build_object(
    'package_id', v_package_id,
    'package_receipt_sha256', v_existing.package_receipt_sha256,
    'expected_item_count', v_existing.expected_item_count
  );
end;
$function$;

create or replace function public.register_luminari_claim_intake_item_v1(
  p_package_id uuid,
  p_item jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_kind text := nullif(btrim(p_item->>'item_kind'), '');
  v_key text := nullif(btrim(p_item->>'item_key'), '');
  v_pages integer[];
  v_existing public.luminari_claim_intake_item_revision_v1%rowtype;
begin
  if not exists (
    select 1 from public.luminari_claim_intake_package_v1 where package_id = p_package_id
  ) then
    raise exception 'claim/intake package does not exist: %', p_package_id;
  end if;
  if jsonb_typeof(p_item) is distinct from 'object'
     or v_kind not in (
       'claim_identity', 'intake_option', 'structural_barrier',
       'legal_authority_linkage', 'enforcement_role_linkage',
       'year_context_note', 'claim_alias', 'claim_intersection',
       'cross_lens_binding', 'direct_resource', 'direct_resource_binding'
     )
     or v_key is null
     or coalesce(p_item->>'item_revision_key', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_item->>'record_payload_sha256', '') !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_item->>'direct_source_reference'), '') is null
     or jsonb_typeof(p_item->'record_payload') is distinct from 'object'
     or jsonb_typeof(p_item->'field_provenance') is distinct from 'object' then
    raise exception 'invalid claim/intake item registration: %', coalesce(v_key, '<missing>');
  end if;

  select array_agg(value::integer order by ordinality)
    into v_pages
  from jsonb_array_elements_text(p_item->'source_pages')
    with ordinality as page(value, ordinality);
  if coalesce(cardinality(v_pages), 0) = 0
     or exists (select 1 from unnest(v_pages) page where page <= 0) then
    raise exception 'claim/intake item page provenance is required: %', v_key;
  end if;

  if v_kind = 'intake_option' and (
    p_item->>'access_state' is distinct from 'intake_internal'
    or p_item->>'visibility_state' is distinct from 'intake_candidate'
    or coalesce((p_item->>'requires_separate_publication_gate')::boolean, true)
    or nullif(btrim(p_item->>'state_code'), '') is null
    or coalesce((p_item#>>'{record_payload,optional}')::boolean, false) is not true
    or coalesce((p_item#>>'{record_payload,provider_independent}')::boolean, false) is not true
    or coalesce((p_item#>>'{record_payload,user_controls_timing}')::boolean, false) is not true
    or coalesce((p_item#>>'{record_payload,is_gating}')::boolean, true) is not false
  ) then
    raise exception 'intake option left its internal optional lane: %', v_key;
  end if;
  if v_kind in ('direct_resource', 'direct_resource_binding') and (
    p_item->>'access_state' is distinct from 'person_facing_candidate'
    or p_item->>'visibility_state' is distinct from 'separately_gated_person_facing_candidate'
    or coalesce((p_item->>'requires_separate_publication_gate')::boolean, false) is not true
    or coalesce(
      nullif(btrim(p_item#>>'{record_payload,website}'), ''),
      nullif(btrim(p_item#>>'{record_payload,phone}'), '')
    ) is null
  ) then
    raise exception 'direct resource candidate lacks a real, separately gated access point: %', v_key;
  end if;
  if v_kind = 'enforcement_role_linkage' and (
    p_item->>'access_state' is distinct from 'service_only'
    or p_item->>'visibility_state' is distinct from 'review_hold'
    or coalesce((p_item#>>'{record_payload,access_point_present}')::boolean, true)
  ) then
    raise exception 'name-only enforcement linkage left review hold: %', v_key;
  end if;

  insert into public.luminari_claim_intake_item_revision_v1 (
    package_id, item_kind, item_key, item_revision_key, claim_id,
    state_code, access_state, visibility_state,
    requires_separate_publication_gate, source_pages,
    direct_source_reference, record_payload_sha256,
    record_payload, field_provenance
  ) values (
    p_package_id, v_kind, v_key, p_item->>'item_revision_key',
    nullif(btrim(p_item->>'claim_id'), ''),
    nullif(btrim(p_item->>'state_code'), ''), p_item->>'access_state',
    p_item->>'visibility_state',
    (p_item->>'requires_separate_publication_gate')::boolean,
    v_pages, p_item->>'direct_source_reference',
    p_item->>'record_payload_sha256', p_item->'record_payload',
    p_item->'field_provenance'
  ) on conflict (package_id, item_kind, item_key) do nothing;

  select * into strict v_existing
  from public.luminari_claim_intake_item_revision_v1
  where package_id = p_package_id and item_kind = v_kind and item_key = v_key;

  if v_existing.item_revision_key is distinct from p_item->>'item_revision_key'
     or v_existing.record_payload_sha256 is distinct from p_item->>'record_payload_sha256'
     or v_existing.record_payload is distinct from p_item->'record_payload'
     or v_existing.field_provenance is distinct from p_item->'field_provenance'
     or v_existing.access_state is distinct from p_item->>'access_state'
     or v_existing.visibility_state is distinct from p_item->>'visibility_state'
     or v_existing.direct_source_reference is distinct from p_item->>'direct_source_reference'
     or v_existing.source_pages is distinct from v_pages then
    raise exception 'claim/intake exact item key was reused with different content: %', v_key;
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'item_kind', v_kind,
    'item_key', v_key,
    'item_revision_key', v_existing.item_revision_key
  );
end;
$function$;

create or replace function public.activate_luminari_claim_intake_package_v1(
  p_activation jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_activation_id uuid := nullif(btrim(p_activation->>'activation_id'), '')::uuid;
  v_package_id uuid := nullif(btrim(p_activation->>'package_id'), '')::uuid;
  v_package public.luminari_claim_intake_package_v1%rowtype;
  v_existing public.luminari_claim_intake_activation_v1%rowtype;
  v_count integer;
  v_kind_counts jsonb;
begin
  select * into strict v_package
  from public.luminari_claim_intake_package_v1 where package_id = v_package_id;
  if p_activation->>'source_filename' is distinct from v_package.source_filename
     or coalesce(p_activation->>'activation_receipt_sha256', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_activation->'activation_receipt') is distinct from 'object'
     or p_activation#>>'{activation_receipt,package_receipt_sha256}'
        is distinct from v_package.package_receipt_sha256 then
    raise exception 'claim/intake activation identity or receipt is invalid';
  end if;

  select coalesce(sum(item_count), 0)::integer,
         coalesce(jsonb_object_agg(item_kind, item_count order by item_kind), '{}'::jsonb)
    into v_count, v_kind_counts
  from (
    select item_kind, count(*)::integer as item_count
    from public.luminari_claim_intake_item_revision_v1
    where package_id = v_package_id
    group by item_kind
  ) counts;
  if v_count is distinct from v_package.expected_item_count
     or v_kind_counts is distinct from v_package.expected_kind_counts then
    raise exception 'claim/intake package is incomplete; activation refused';
  end if;

  insert into public.luminari_claim_intake_activation_v1 (
    activation_id, package_id, source_filename,
    activation_receipt_sha256, activation_receipt
  ) values (
    v_activation_id, v_package_id, v_package.source_filename,
    p_activation->>'activation_receipt_sha256',
    p_activation->'activation_receipt'
  ) on conflict (activation_id) do nothing;

  select * into strict v_existing
  from public.luminari_claim_intake_activation_v1
  where activation_id = v_activation_id;
  if v_existing.package_id is distinct from v_package_id
     or v_existing.source_filename is distinct from v_package.source_filename
     or v_existing.activation_receipt_sha256 is distinct from p_activation->>'activation_receipt_sha256'
     or v_existing.activation_receipt is distinct from p_activation->'activation_receipt' then
    raise exception 'claim/intake activation id was reused with different content';
  end if;

  return jsonb_build_object(
    'activation_id', v_activation_id,
    'package_id', v_package_id,
    'activation_receipt_sha256', v_existing.activation_receipt_sha256
  );
end;
$function$;

revoke all on function public.register_luminari_claim_intake_package_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.register_luminari_claim_intake_item_v1(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_luminari_claim_intake_package_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.register_luminari_claim_intake_package_v1(jsonb)
  to service_role;
grant execute on function public.register_luminari_claim_intake_item_v1(uuid, jsonb)
  to service_role;
grant execute on function public.activate_luminari_claim_intake_package_v1(jsonb)
  to service_role;

create or replace view public.v_luminari_claim_intake_package_current_v1
with (security_invoker = true) as
with ranked as (
  select
    a.*,
    lower(regexp_replace(btrim(a.source_filename), '[[:space:]]+', ' ', 'g'))
      as normalized_source_filename,
    row_number() over (
      partition by lower(regexp_replace(btrim(a.source_filename), '[[:space:]]+', ' ', 'g'))
      order by a.activated_at desc, a.activation_id desc
    ) as source_rank
  from public.luminari_claim_intake_activation_v1 a
)
select
  activation_id, package_id, source_filename, normalized_source_filename,
  activation_receipt_sha256, activation_receipt, activated_at
from ranked where source_rank = 1;

create or replace view public.v_luminari_claim_intake_item_current_v1
with (security_invoker = true) as
select
  i.item_revision_id, i.package_id, i.item_kind, i.item_key,
  i.item_revision_key, i.claim_id, i.state_code, i.access_state,
  i.visibility_state, i.requires_separate_publication_gate,
  i.source_pages, i.direct_source_reference, i.record_payload_sha256,
  i.record_payload, i.field_provenance, i.created_at,
  p.activation_id, p.activated_at
from public.luminari_claim_intake_item_revision_v1 i
join public.v_luminari_claim_intake_package_current_v1 p using (package_id);

create or replace view public.v_luminari_claim_intake_claim_current_v1
with (security_invoker = true) as
select * from public.v_luminari_claim_intake_item_current_v1
where item_kind = 'claim_identity';

create or replace view public.v_luminari_claim_intake_option_current_v1
with (security_invoker = true) as
select * from public.v_luminari_claim_intake_item_current_v1
where item_kind = 'intake_option' and access_state = 'intake_internal';

create or replace view public.v_luminari_claim_intake_direct_resource_candidate_current_v1
with (security_invoker = true) as
select * from public.v_luminari_claim_intake_item_current_v1
where item_kind in ('direct_resource', 'direct_resource_binding')
  and access_state = 'person_facing_candidate'
  and visibility_state = 'separately_gated_person_facing_candidate'
  and requires_separate_publication_gate;

revoke all on public.v_luminari_claim_intake_package_current_v1
  from public, anon, authenticated, service_role;
revoke all on public.v_luminari_claim_intake_item_current_v1
  from public, anon, authenticated, service_role;
revoke all on public.v_luminari_claim_intake_claim_current_v1
  from public, anon, authenticated, service_role;
revoke all on public.v_luminari_claim_intake_option_current_v1
  from public, anon, authenticated, service_role;
revoke all on public.v_luminari_claim_intake_direct_resource_candidate_current_v1
  from public, anon, authenticated, service_role;
grant select on public.v_luminari_claim_intake_package_current_v1 to service_role;
grant select on public.v_luminari_claim_intake_item_current_v1 to service_role;
grant select on public.v_luminari_claim_intake_claim_current_v1 to service_role;
grant select on public.v_luminari_claim_intake_option_current_v1 to service_role;
grant select on public.v_luminari_claim_intake_direct_resource_candidate_current_v1
  to service_role;

comment on table public.luminari_claim_intake_item_revision_v1 is
  'Append-only internal claim/intake records. Intake options are never Resource Directory routes; direct resource candidates require a later separate publication gate.';
comment on view public.v_luminari_claim_intake_option_current_v1 is
  'Service-role-only optional intake choices from the current activated package; not a resource route surface.';
comment on view public.v_luminari_claim_intake_direct_resource_candidate_current_v1 is
  'Service-role-only reviewed direct-resource candidates with real access points. No record becomes public without a separate publication decision.';
