-- Append-only, case-owned persistence for choices made from the reviewed Claim
-- Catalog during Guided Intake. These records preserve a user's optional
-- selections; they never activate an action and never publish a resource.

create table if not exists public.luminari_case_reviewed_intake_selection_event_v1 (
  event_id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  legacy_case_id integer not null
    references public.cases(id) on delete cascade,
  user_id integer not null,
  event_type text not null,
  selection_kind text not null,
  item_key text not null,
  source_item_revision_id uuid not null
    references public.luminari_claim_intake_item_revision_v1(item_revision_id)
    on delete restrict,
  source_package_id uuid not null
    references public.luminari_claim_intake_package_v1(package_id)
    on delete restrict,
  claim_id text not null,
  action_key text,
  display_label text not null,
  domain text not null,
  action_kind text,
  state_code text not null,
  optional boolean not null default true,
  provider_independent boolean not null default true,
  is_gating boolean not null default false,
  user_controls_timing boolean not null default true,
  selected_at timestamptz not null default now(),
  constraint luminari_case_reviewed_intake_event_key_check check (
    nullif(btrim(event_key), '') is not null
    and nullif(btrim(item_key), '') is not null
  ),
  constraint luminari_case_reviewed_intake_event_type_check check (
    event_type in ('selected', 'deselected')
  ),
  constraint luminari_case_reviewed_intake_selection_kind_check check (
    selection_kind in ('claim', 'option')
  ),
  constraint luminari_case_reviewed_intake_identity_check check (
    claim_id ~ '^[A-Z]{3}-[0-9]{3}$'
    and state_code ~ '^[A-Z]{2}$'
    and nullif(btrim(display_label), '') is not null
    and nullif(btrim(domain), '') is not null
  ),
  constraint luminari_case_reviewed_intake_choice_check check (
    optional
    and provider_independent
    and not is_gating
    and user_controls_timing
  ),
  constraint luminari_case_reviewed_intake_kind_payload_check check (
    case selection_kind
      when 'claim' then action_key is null and action_kind is null
      when 'option' then
        nullif(btrim(action_key), '') is not null
        and nullif(btrim(action_kind), '') is not null
      else false
    end
  )
);

create index if not exists luminari_case_reviewed_intake_owner_current_idx
  on public.luminari_case_reviewed_intake_selection_event_v1
  (legacy_case_id, user_id, selected_at desc, event_id desc);

create index if not exists luminari_case_reviewed_intake_item_current_idx
  on public.luminari_case_reviewed_intake_selection_event_v1
  (legacy_case_id, selection_kind, item_key, selected_at desc, event_id desc);

alter table public.luminari_case_reviewed_intake_selection_event_v1
  enable row level security;

revoke all on public.luminari_case_reviewed_intake_selection_event_v1
  from public, anon, authenticated, service_role;

do $case_reviewed_intake_policies$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'luminari_case_reviewed_intake_selection_event_v1'
      and policyname = 'luminari_case_reviewed_intake_selection_service_select_v1'
  ) then
    execute 'create policy luminari_case_reviewed_intake_selection_service_select_v1 on public.luminari_case_reviewed_intake_selection_event_v1 for select to service_role using (true)';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'luminari_case_reviewed_intake_selection_event_v1'
      and policyname = 'luminari_case_reviewed_intake_selection_service_insert_v1'
  ) then
    execute 'create policy luminari_case_reviewed_intake_selection_service_insert_v1 on public.luminari_case_reviewed_intake_selection_event_v1 for insert to service_role with check (true)';
  end if;
end;
$case_reviewed_intake_policies$;

grant select, insert
  on public.luminari_case_reviewed_intake_selection_event_v1
  to service_role;

create or replace view public.v_luminari_case_reviewed_intake_selection_event_v1
with (security_invoker = true) as
select
  event_id,
  event_key,
  legacy_case_id,
  user_id,
  event_type,
  selection_kind,
  item_key,
  source_item_revision_id,
  source_package_id,
  claim_id,
  action_key,
  display_label,
  domain,
  action_kind,
  state_code,
  optional,
  provider_independent,
  is_gating,
  user_controls_timing,
  selected_at
from public.luminari_case_reviewed_intake_selection_event_v1;

create or replace view public.v_luminari_case_reviewed_intake_selection_current_v1
with (security_invoker = true) as
with ranked as (
  select
    event.*,
    row_number() over (
      partition by legacy_case_id, selection_kind, item_key
      order by selected_at desc, event_id desc
    ) as event_rank
  from public.v_luminari_case_reviewed_intake_selection_event_v1 event
)
select
  event_id,
  event_key,
  legacy_case_id,
  user_id,
  selection_kind,
  item_key,
  source_item_revision_id,
  source_package_id,
  claim_id,
  action_key,
  display_label,
  domain,
  action_kind,
  state_code,
  optional,
  provider_independent,
  is_gating,
  user_controls_timing,
  selected_at
from ranked
where event_rank = 1
  and event_type = 'selected';

revoke all on public.v_luminari_case_reviewed_intake_selection_event_v1
  from public, anon, authenticated, service_role;
revoke all on public.v_luminari_case_reviewed_intake_selection_current_v1
  from public, anon, authenticated, service_role;

grant select on public.v_luminari_case_reviewed_intake_selection_event_v1
  to service_role;
grant select on public.v_luminari_case_reviewed_intake_selection_current_v1
  to service_role;

comment on table public.luminari_case_reviewed_intake_selection_event_v1 is
  'Append-only case-owned record of optional reviewed intake choices. Runtime roles receive SELECT/INSERT only; case expungement remains available through the parent case cascade.';
comment on view public.v_luminari_case_reviewed_intake_selection_current_v1 is
  'Latest append-only reviewed intake selection state per case and exact item key. Service-role only; no selection activates an action.';
