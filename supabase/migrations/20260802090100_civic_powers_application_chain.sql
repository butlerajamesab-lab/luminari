-- Civic Powers and Constraints application-chain extension.
-- Additive and intentionally unseeded.
-- One event may involve many actors, and one mechanism may traverse many events.

begin;

create table if not exists public.civic_power_application_actor (
  application_id uuid not null references public.civic_power_application(application_id),
  actor_id uuid not null references public.civic_power_actor(actor_id),
  role_type text not null check (role_type in (
    'issuer','author','sponsor','implementing_agency','enforcing_agency',
    'plaintiff','defendant','petitioner','respondent','intervenor','movant',
    'adjudicator','appellant','appellee','amicus','local_continuation_actor',
    'affected_government','removing_authority','removed_officer',
    'appointing_authority','confirming_body','remaining_member','other'
  )),
  valid_from timestamptz,
  valid_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by text,
  primary key (application_id, actor_id, role_type, content_hash)
);

create table if not exists public.civic_power_application_edge (
  application_edge_id uuid primary key default gen_random_uuid(),
  from_application_id uuid not null references public.civic_power_application(application_id),
  relation_type text not null check (relation_type in (
    'initiates','implements','challenges','responds_to','stays','enjoins',
    'vacates','affirms','reverses','remands','supersedes','continues_locally',
    'incorporates','produces_similar_effect','depends_on','causes',
    'causes_delay','enables','disables','restores_capacity','other'
  )),
  to_application_id uuid not null references public.civic_power_application(application_id),
  directness text not null check (directness in ('direct','indirect','parallel','unknown')),
  conditions_json jsonb not null default '[]'::jsonb,
  exceptions_json jsonb not null default '[]'::jsonb,
  valid_from timestamptz,
  valid_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by text,
  check (from_application_id <> to_application_id)
);

create table if not exists public.civic_power_application_edge_source (
  application_edge_id uuid not null references public.civic_power_application_edge(application_edge_id),
  source_id uuid not null references public.civic_power_source(source_id),
  relation_type text not null check (relation_type in (
    'primary_basis','supporting','contradicting','procedural_history','status_basis'
  )),
  created_at timestamptz not null default now(),
  primary key (application_edge_id, source_id, relation_type)
);

create index if not exists civic_power_application_actor_actor_idx
  on public.civic_power_application_actor(actor_id, role_type, application_id);
create index if not exists civic_power_application_edge_from_idx
  on public.civic_power_application_edge(from_application_id, relation_type, to_application_id);
create index if not exists civic_power_application_edge_to_idx
  on public.civic_power_application_edge(to_application_id, relation_type, from_application_id);

alter table public.civic_power_application_actor enable row level security;
alter table public.civic_power_application_edge enable row level security;
alter table public.civic_power_application_edge_source enable row level security;

create trigger civic_power_application_actor_immutable
before update or delete on public.civic_power_application_actor
for each row execute function public.reject_civic_power_canonical_mutation();

create trigger civic_power_application_edge_immutable
before update or delete on public.civic_power_application_edge
for each row execute function public.reject_civic_power_canonical_mutation();

create trigger civic_power_application_edge_source_immutable
before update or delete on public.civic_power_application_edge_source
for each row execute function public.reject_civic_power_canonical_mutation();

revoke all on table public.civic_power_application_actor from anon, authenticated;
revoke all on table public.civic_power_application_edge from anon, authenticated;
revoke all on table public.civic_power_application_edge_source from anon, authenticated;

comment on table public.civic_power_application_actor is
  'Immutable many-to-many application actor roles. Actor participation does not itself establish coordination, motive, or causation.';
comment on table public.civic_power_application_edge is
  'Immutable sourced relationships between civic-power applications. produces_similar_effect is noncausal. causes and causes_delay are causal claims and require direct documentary support.';
comment on table public.civic_power_application_edge_source is
  'Primary, supporting, contradicting, procedural, and status sources for one application-chain edge.';

commit;
