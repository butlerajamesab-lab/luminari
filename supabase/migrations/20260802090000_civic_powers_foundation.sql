-- Civic Powers and Constraints foundation.
-- Additive, source-bound, and intentionally unseeded.
-- Source != interpretation != current application != projection.

begin;

create extension if not exists pgcrypto;

create or replace function public.reject_civic_power_canonical_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'civic_power_canonical_record_is_immutable';
end;
$$;

create table if not exists public.civic_power_actor (
  actor_id uuid primary key default gen_random_uuid(),
  actor_key text not null unique,
  actor_name text not null,
  actor_type text not null check (actor_type in (
    'branch','chamber','court','office','agency','department','commission',
    'government','interstate_body','officer','other'
  )),
  identity_scope text not null check (identity_scope in ('institution','office','officeholder')),
  government_level text not null check (government_level in (
    'federal','state','tribal','local','interstate','territorial','other'
  )),
  branch text check (branch is null or branch in (
    'legislative','executive','judicial','independent','interbranch','other'
  )),
  jurisdiction text not null,
  parent_actor_id uuid references public.civic_power_actor(actor_id),
  valid_from date,
  valid_to date,
  metadata jsonb not null default '{}'::jsonb,
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  supersedes_actor_id uuid references public.civic_power_actor(actor_id),
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.civic_power_source (
  source_id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in (
    'constitution','constitutional_amendment','statute','regulation',
    'executive_order','presidential_memorandum','proclamation',
    'agency_rule','agency_guidance','appropriation','treaty',
    'court_opinion','court_order','court_docket','legislative_record',
    'official_report','official_position','procedural_rule','other'
  )),
  jurisdiction text not null,
  issuing_actor_id uuid references public.civic_power_actor(actor_id),
  citation text not null,
  title text not null,
  source_version text not null,
  source_url text not null,
  source_text text,
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  source_byte_hash text check (source_byte_hash is null or source_byte_hash ~ '^[0-9a-f]{64}$'),
  effective_from date,
  effective_to date,
  published_at timestamptz,
  retrieved_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  admissibility_state text not null check (admissibility_state in ('pending','admissible','rejected')),
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  source_identity_hash text not null unique check (source_identity_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by text,
  unique (jurisdiction, citation, source_version, source_content_hash)
);

create table if not exists public.civic_power_clause (
  clause_id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.civic_power_source(source_id),
  clause_key text not null,
  article text,
  section text,
  clause_number text,
  heading text,
  verbatim_text text not null,
  char_offset_start integer not null check (char_offset_start >= 0),
  char_offset_end integer not null check (char_offset_end > char_offset_start),
  clause_hash text not null check (clause_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, clause_key),
  unique (source_id, clause_hash, char_offset_start, char_offset_end)
);

create table if not exists public.civic_power_interpretation (
  interpretation_id uuid primary key default gen_random_uuid(),
  interpretation_type text not null check (interpretation_type in (
    'plain_language_context','judicial_holding','judicial_dicta',
    'historical_practice','official_branch_position','scholarly_analysis',
    'unresolved_question'
  )),
  statement text not null,
  authority_status text not null check (authority_status in (
    'constitutional_text','binding_holding','controlling_statute',
    'controlling_regulation','persuasive_authority','official_position',
    'historical_practice','contested','superseded','unresolved'
  )),
  valid_from date,
  valid_to date,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  supersedes_interpretation_id uuid references public.civic_power_interpretation(interpretation_id),
  metadata jsonb not null default '{}'::jsonb,
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.civic_power_interpretation_clause (
  interpretation_id uuid not null references public.civic_power_interpretation(interpretation_id),
  clause_id uuid not null references public.civic_power_clause(clause_id),
  relation_type text not null check (relation_type in (
    'interprets','supports','limits','contradicts','supersedes'
  )),
  created_at timestamptz not null default now(),
  primary key (interpretation_id, clause_id, relation_type)
);

create table if not exists public.civic_power_interpretation_source (
  interpretation_id uuid not null references public.civic_power_interpretation(interpretation_id),
  source_id uuid not null references public.civic_power_source(source_id),
  relation_type text not null check (relation_type in (
    'primary_basis','supporting','contradicting','procedural_history','status_basis'
  )),
  created_at timestamptz not null default now(),
  primary key (interpretation_id, source_id, relation_type)
);

create table if not exists public.civic_power_edge (
  edge_id uuid primary key default gen_random_uuid(),
  from_object_type text not null check (from_object_type in (
    'actor','source','clause','interpretation','application'
  )),
  from_object_id uuid not null,
  edge_type text not null check (edge_type in (
    'grants_power','imposes_duty','limits_power','checks_power',
    'requires_consent_from','requires_appropriation_from','requires_procedure',
    'authorizes_review_by','authorizes_remedy','preempts','delegates_to',
    'revokes_delegation','supersedes','contradicts','depends_on'
  )),
  to_object_type text not null check (to_object_type in (
    'actor','source','clause','interpretation','application'
  )),
  to_object_id uuid not null,
  conditions_json jsonb not null default '[]'::jsonb,
  exceptions_json jsonb not null default '[]'::jsonb,
  valid_from date,
  valid_to date,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  metadata jsonb not null default '{}'::jsonb,
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  supersedes_edge_id uuid references public.civic_power_edge(edge_id),
  created_at timestamptz not null default now(),
  created_by text,
  check (from_object_type <> to_object_type or from_object_id <> to_object_id)
);

create table if not exists public.civic_power_edge_source (
  edge_id uuid not null references public.civic_power_edge(edge_id),
  source_id uuid not null references public.civic_power_source(source_id),
  relation_type text not null check (relation_type in (
    'primary_basis','supporting','contradicting','exception_basis'
  )),
  created_at timestamptz not null default now(),
  primary key (edge_id, source_id, relation_type)
);

create table if not exists public.civic_power_application (
  application_id uuid primary key default gen_random_uuid(),
  application_key text not null unique,
  application_type text not null check (application_type in (
    'bill','enacted_law','executive_order','presidential_memorandum',
    'proclamation','agency_rule','agency_guidance','funding_directive',
    'deployment_order','court_case','court_order','judgment',
    'congressional_vote','confirmation','veto','veto_override',
    'impeachment','removal','other'
  )),
  actor_id uuid not null references public.civic_power_actor(actor_id),
  instrument_source_id uuid not null references public.civic_power_source(source_id),
  procedural_state text not null,
  operative_state text not null,
  occurred_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  metadata jsonb not null default '{}'::jsonb,
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  supersedes_application_id uuid references public.civic_power_application(application_id),
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.civic_power_application_authority (
  application_id uuid not null references public.civic_power_application(application_id),
  authority_object_type text not null check (authority_object_type in ('clause','interpretation','edge')),
  authority_object_id uuid not null,
  relation_type text not null check (relation_type in (
    'claimed','supporting','limiting','challenged','rejected','accepted'
  )),
  created_at timestamptz not null default now(),
  primary key (application_id, authority_object_type, authority_object_id, relation_type)
);

create table if not exists public.civic_power_application_source (
  application_id uuid not null references public.civic_power_application(application_id),
  source_id uuid not null references public.civic_power_source(source_id),
  relation_type text not null check (relation_type in (
    'instrument','procedural_history','challenge','response','status_basis'
  )),
  created_at timestamptz not null default now(),
  primary key (application_id, source_id, relation_type)
);

create table if not exists public.civic_power_status_receipt (
  receipt_id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.civic_power_application(application_id),
  as_of timestamptz not null,
  status text not null check (status in (
    'proposed','introduced','issued','effective','stayed','enjoined',
    'vacated','affirmed','reversed','remanded','expired','superseded',
    'contested','unresolved'
  )),
  status_basis text not null,
  verification_state text not null check (verification_state in (
    'unverified','document_stated','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed',
    'incomplete','unresolved','verified'
  )),
  engine_version text not null,
  rule_version text not null,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text not null check (output_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (application_id, as_of, output_hash)
);

create table if not exists public.civic_power_status_receipt_source (
  receipt_id uuid not null references public.civic_power_status_receipt(receipt_id),
  source_id uuid not null references public.civic_power_source(source_id),
  relation_type text not null check (relation_type in (
    'primary_status_basis','supporting','contradicting'
  )),
  created_at timestamptz not null default now(),
  primary key (receipt_id, source_id, relation_type)
);

create index if not exists civic_power_actor_branch_idx
  on public.civic_power_actor(government_level, branch, jurisdiction);
create index if not exists civic_power_source_citation_idx
  on public.civic_power_source(jurisdiction, citation, source_version);
create index if not exists civic_power_source_type_idx
  on public.civic_power_source(source_type, effective_from, effective_to);
create index if not exists civic_power_clause_source_idx
  on public.civic_power_clause(source_id, article, section, clause_number);
create index if not exists civic_power_interpretation_status_idx
  on public.civic_power_interpretation(authority_status, verification_state, valid_from, valid_to);
create index if not exists civic_power_edge_from_idx
  on public.civic_power_edge(from_object_type, from_object_id, edge_type);
create index if not exists civic_power_edge_to_idx
  on public.civic_power_edge(to_object_type, to_object_id, edge_type);
create index if not exists civic_power_application_actor_idx
  on public.civic_power_application(actor_id, application_type, occurred_at);
create index if not exists civic_power_status_application_idx
  on public.civic_power_status_receipt(application_id, as_of desc);

alter table public.civic_power_actor enable row level security;
alter table public.civic_power_source enable row level security;
alter table public.civic_power_clause enable row level security;
alter table public.civic_power_interpretation enable row level security;
alter table public.civic_power_interpretation_clause enable row level security;
alter table public.civic_power_interpretation_source enable row level security;
alter table public.civic_power_edge enable row level security;
alter table public.civic_power_edge_source enable row level security;
alter table public.civic_power_application enable row level security;
alter table public.civic_power_application_authority enable row level security;
alter table public.civic_power_application_source enable row level security;
alter table public.civic_power_status_receipt enable row level security;
alter table public.civic_power_status_receipt_source enable row level security;

-- Canonical records are additive. Corrections and changes are represented by
-- superseding records and new status receipts rather than mutation.
create trigger civic_power_actor_immutable
before update or delete on public.civic_power_actor
for each row execute function public.reject_civic_power_canonical_mutation();
create trigger civic_power_source_immutable
before update or delete on public.civic_power_source
for each row execute function public.reject_civic_power_canonical_mutation();
create trigger civic_power_clause_immutable
before update or delete on public.civic_power_clause
for each row execute function public.reject_civic_power_canonical_mutation();
create trigger civic_power_interpretation_immutable
before update or delete on public.civic_power_interpretation
for each row execute function public.reject_civic_power_canonical_mutation();
create trigger civic_power_edge_immutable
before update or delete on public.civic_power_edge
for each row execute function public.reject_civic_power_canonical_mutation();
create trigger civic_power_application_immutable
before update or delete on public.civic_power_application
for each row execute function public.reject_civic_power_canonical_mutation();
create trigger civic_power_status_receipt_immutable
before update or delete on public.civic_power_status_receipt
for each row execute function public.reject_civic_power_canonical_mutation();

revoke all on table public.civic_power_actor from anon, authenticated;
revoke all on table public.civic_power_source from anon, authenticated;
revoke all on table public.civic_power_clause from anon, authenticated;
revoke all on table public.civic_power_interpretation from anon, authenticated;
revoke all on table public.civic_power_interpretation_clause from anon, authenticated;
revoke all on table public.civic_power_interpretation_source from anon, authenticated;
revoke all on table public.civic_power_edge from anon, authenticated;
revoke all on table public.civic_power_edge_source from anon, authenticated;
revoke all on table public.civic_power_application from anon, authenticated;
revoke all on table public.civic_power_application_authority from anon, authenticated;
revoke all on table public.civic_power_application_source from anon, authenticated;
revoke all on table public.civic_power_status_receipt from anon, authenticated;
revoke all on table public.civic_power_status_receipt_source from anon, authenticated;

comment on table public.civic_power_source is
  'Immutable primary and official source records for Civic Powers. Source records are separate from interpretations and current applications.';
comment on table public.civic_power_interpretation is
  'Versioned sourced legal meanings, holdings, official positions, historical practices, and unresolved questions. Never verbatim-source truth.';
comment on table public.civic_power_edge is
  'Deterministic grants, duties, limits, checks, delegations, dependencies, review paths, and remedies between governed objects.';
comment on table public.civic_power_application is
  'Time-bounded real-world instruments and actions applying or asserting civic power.';
comment on table public.civic_power_status_receipt is
  'Immutable as-of observation of an application status. Later status creates another receipt and never overwrites history.';

commit;
