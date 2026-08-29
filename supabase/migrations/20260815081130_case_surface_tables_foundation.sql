-- Reconstruct the four live Lighthouse case-surface relations that were not
-- represented in the migration ledger.  These are empty structural contracts;
-- no entities, relationships, signals, or evidence are inferred.

create table if not exists public.entities (
  id integer,
  case_id integer,
  name text,
  type text,
  description text,
  aliases text,
  engine_version text,
  lane_id text,
  snapshot_id integer,
  created_at bigint,
  updated_at bigint,
  legacy_relation_id text
);

create table if not exists public.evidence (
  id serial primary key,
  case_id integer,
  type text,
  content text,
  created_at timestamptz
);

create table if not exists public.relationships (
  id serial primary key,
  case_id integer,
  source_entity_id integer,
  target_entity_id integer,
  relationship_type text,
  description text,
  evidence_count integer,
  engine_version timestamptz,
  lane_id timestamptz,
  snapshot_id integer
);

create table if not exists public.signals (
  id serial primary key,
  case_id integer,
  evidence_id integer,
  signal_type text,
  description text,
  created_at timestamptz,
  fingerprint text
);

alter table public.entities enable row level security;
alter table public.evidence enable row level security;
alter table public.relationships enable row level security;
alter table public.signals enable row level security;

revoke all on public.entities, public.evidence, public.relationships, public.signals
  from public, anon, authenticated;
grant select, insert, update, delete on public.entities,
  public.evidence, public.relationships, public.signals to service_role;
grant usage, select on sequence public.evidence_id_seq,
  public.relationships_id_seq, public.signals_id_seq to service_role;

drop policy if exists service_role_all_entities on public.entities;
create policy service_role_all_entities on public.entities
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_evidence on public.evidence;
create policy service_role_all_evidence on public.evidence
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_relationships on public.relationships;
create policy service_role_all_relationships on public.relationships
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_signals on public.signals;
create policy service_role_all_signals on public.signals
  for all to service_role using (true) with check (true);

comment on table public.entities is
  'Service-only Lighthouse case entities reconstructed for executable migration replay.';
comment on table public.evidence is
  'Service-only Lighthouse case evidence reconstructed for executable migration replay.';
comment on table public.relationships is
  'Service-only Lighthouse case relationships reconstructed for executable migration replay.';
comment on table public.signals is
  'Service-only Lighthouse case structural signals reconstructed for executable migration replay.';
