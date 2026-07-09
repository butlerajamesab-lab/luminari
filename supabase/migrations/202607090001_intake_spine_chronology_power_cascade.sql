-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 202607090001_intake_spine_chronology_power_cascade.sql
--
-- Adds intake spine tables for:
--   L3: chronology_events      — chronology-first reconstruction of case events
--   L6: power_dynamics_registry — authority/control/burden structure as neutral data
--   L9: cascade_registry        — evidence-based causal trajectory across domains
--
-- These tables enrich the existing case spine without replacing any existing surface:
--   - guided_intake       → enriched: answers now normalize into these tables
--   - evidence_items      → enriched: evidence_source_ids links here
--   - intake_records      → unchanged: raw payload capture unchanged
--   - intake_staging      → enriched: 10 evidence source types now route here
--   - pattern_registry    → unchanged: related_pattern_ids links existing tables
--   - procedural_outputs  → unchanged: downstream, not duplicated
--   - action_paths        → unchanged: downstream, not duplicated
--   - rights tables       → unchanged: downstream, not duplicated
--
-- Ordering invariant enforced at DB level:
--   cascade_registry.related_chronology_ids must be non-null and non-empty.
--   Chronology must precede cascades.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── L3: chronology_events ───────────────────────────────────────────────────

create table if not exists public.chronology_events (
  id                      uuid primary key default gen_random_uuid(),
  case_id                 uuid not null references public.cases(id) on delete cascade,
  chronology_event_id     text not null,
  event_date              timestamptz,
  source_date             text,
  observed_event          text not null,
  people_involved         jsonb default '[]'::jsonb,
  evidence_source         text,
  immediate_consequence   text,
  outstanding_follow_up   text,
  source_references       jsonb default '[]'::jsonb,
  event_confidence_level  text not null default 'unverified',
  created_from_path       text,
  normalization_version   text,
  status                  text not null default 'active',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint chronology_events_chronology_event_id_unique
    unique (chronology_event_id),

  constraint chronology_events_confidence_level_valid check (
    event_confidence_level in ('confirmed', 'probable', 'reported', 'unverified')
  ),

  constraint chronology_events_status_valid check (
    status in ('active', 'superseded', 'disputed')
  ),

  constraint chronology_events_people_involved_array check (
    jsonb_typeof(people_involved) = 'array'
  ),

  constraint chronology_events_source_references_array check (
    jsonb_typeof(source_references) = 'array'
  )
);

create index if not exists idx_chronology_events_case_id
  on public.chronology_events (case_id);

create index if not exists idx_chronology_events_event_date
  on public.chronology_events (event_date);

create index if not exists idx_chronology_events_status
  on public.chronology_events (status);

create or replace function public.set_chronology_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_chronology_events_updated_at
  on public.chronology_events;

create trigger set_chronology_events_updated_at
  before update on public.chronology_events
  for each row
  execute function public.set_chronology_events_updated_at();

alter table public.chronology_events enable row level security;

create policy "service role can manage chronology_events"
  on public.chronology_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ─── L6: power_dynamics_registry ─────────────────────────────────────────────

create table if not exists public.power_dynamics_registry (
  id                      uuid primary key default gen_random_uuid(),
  power_dynamics_id       text not null,
  case_id                 uuid not null references public.cases(id) on delete cascade,
  authority_holder        text,
  resident_representative text,
  alternate_representative text,
  decision_maker          text,
  access_controller       text,
  gatekeeper              text,
  dependency_path         text,
  procedural_barrier      text,
  exclusion_event         text,
  retaliation_concern     text,
  documentation_holder    text,
  communication_bottleneck text,
  burden_shift            text,
  user_capacity_limit     text,
  disputed_authority      text,
  informal_power_actor    text,
  power_imbalance_summary text,
  source_event_ids        jsonb default '[]'::jsonb,
  evidence_source_ids     jsonb default '[]'::jsonb,
  confidence_level        text not null default 'low',
  created_from_path       text,
  normalization_version   text,
  status                  text not null default 'active',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint power_dynamics_registry_power_dynamics_id_unique
    unique (power_dynamics_id),

  constraint power_dynamics_registry_confidence_valid check (
    confidence_level in ('low', 'medium', 'high')
  ),

  constraint power_dynamics_registry_status_valid check (
    status in ('active', 'superseded', 'disputed')
  ),

  constraint power_dynamics_registry_source_event_ids_array check (
    jsonb_typeof(source_event_ids) = 'array'
  ),

  constraint power_dynamics_registry_evidence_source_ids_array check (
    jsonb_typeof(evidence_source_ids) = 'array'
  )
);

create index if not exists idx_power_dynamics_case_id
  on public.power_dynamics_registry (case_id);

create index if not exists idx_power_dynamics_status
  on public.power_dynamics_registry (status);

create index if not exists idx_power_dynamics_confidence
  on public.power_dynamics_registry (confidence_level);

create or replace function public.set_power_dynamics_registry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_power_dynamics_registry_updated_at
  on public.power_dynamics_registry;

create trigger set_power_dynamics_registry_updated_at
  before update on public.power_dynamics_registry
  for each row
  execute function public.set_power_dynamics_registry_updated_at();

alter table public.power_dynamics_registry enable row level security;

create policy "service role can manage power_dynamics_registry"
  on public.power_dynamics_registry
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ─── L9: cascade_registry ────────────────────────────────────────────────────

create table if not exists public.cascade_registry (
  id                          uuid primary key default gen_random_uuid(),
  cascade_id                  text not null,
  case_id                     uuid not null references public.cases(id) on delete cascade,
  trigger_event_id            text,
  trigger_summary             text,
  immediate_effect            text,
  secondary_effect            text,
  affected_people             jsonb default '[]'::jsonb,
  affected_entities           jsonb default '[]'::jsonb,
  related_chronology_ids      jsonb not null,
  related_pattern_ids         jsonb default '[]'::jsonb,
  related_power_dynamics_ids  jsonb default '[]'::jsonb,
  related_rights_duties_ids   jsonb default '[]'::jsonb,
  evidence_source_ids         jsonb default '[]'::jsonb,
  confidence_level            text not null default 'low',
  open_questions              text,
  created_from_path           text,
  normalization_version       text,
  status                      text not null default 'active',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint cascade_registry_cascade_id_unique
    unique (cascade_id),

  -- Ordering invariant: cascade must reference at least one chronology event.
  -- Chronology must precede cascades. Enforced here at the DB layer to match
  -- the runtime check in intake-spine-normalization.ts.
  constraint cascade_requires_chronology check (
    jsonb_typeof(related_chronology_ids) = 'array'
    and jsonb_array_length(related_chronology_ids) > 0
  ),

  constraint cascade_registry_confidence_valid check (
    confidence_level in ('low', 'medium', 'high')
  ),

  constraint cascade_registry_status_valid check (
    status in ('active', 'superseded', 'disputed')
  ),

  constraint cascade_registry_affected_people_array check (
    jsonb_typeof(affected_people) = 'array'
  ),

  constraint cascade_registry_affected_entities_array check (
    jsonb_typeof(affected_entities) = 'array'
  ),

  constraint cascade_registry_related_pattern_ids_array check (
    jsonb_typeof(related_pattern_ids) = 'array'
  ),

  constraint cascade_registry_related_power_dynamics_ids_array check (
    jsonb_typeof(related_power_dynamics_ids) = 'array'
  ),

  constraint cascade_registry_evidence_source_ids_array check (
    jsonb_typeof(evidence_source_ids) = 'array'
  )
);

create index if not exists idx_cascade_registry_case_id
  on public.cascade_registry (case_id);

create index if not exists idx_cascade_registry_trigger_event
  on public.cascade_registry (trigger_event_id);

create index if not exists idx_cascade_registry_status
  on public.cascade_registry (status);

-- GIN index on related_chronology_ids for array containment queries
create index if not exists idx_cascade_registry_related_chronology_ids
  on public.cascade_registry using gin (related_chronology_ids);

create or replace function public.set_cascade_registry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cascade_registry_updated_at
  on public.cascade_registry;

create trigger set_cascade_registry_updated_at
  before update on public.cascade_registry
  for each row
  execute function public.set_cascade_registry_updated_at();

alter table public.cascade_registry enable row level security;

create policy "service role can manage cascade_registry"
  on public.cascade_registry
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
