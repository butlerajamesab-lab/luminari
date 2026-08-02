-- Initial Civic Genome node foundation
-- Additive only. Preserves the existing legislative Genome substrate.

create extension if not exists pgcrypto;

create table if not exists public.civic_genome_node (
  node_id uuid primary key default gen_random_uuid(),
  node_key text not null unique,
  node_type text not null,
  node_label text not null,
  domain_key text,
  jurisdiction_level text,
  jurisdiction text,
  lifecycle_status text not null default 'active',
  verification_status text not null default 'unverified',
  source_family_key text,
  source_table text,
  source_pk text,
  source_hash text,
  attributes_json jsonb not null default '{}'::jsonb,
  provenance_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_node_type_nonempty check (length(trim(node_type)) > 0),
  constraint civic_genome_node_label_nonempty check (length(trim(node_label)) > 0)
);

create table if not exists public.civic_genome_edge (
  edge_id uuid primary key default gen_random_uuid(),
  edge_key text not null unique,
  from_node_id uuid not null references public.civic_genome_node(node_id) on delete cascade,
  to_node_id uuid not null references public.civic_genome_node(node_id) on delete cascade,
  relationship_type text not null,
  relationship_status text not null default 'observed',
  confidence_score numeric(6,5),
  verification_status text not null default 'unverified',
  evidence_json jsonb not null default '{}'::jsonb,
  provenance_json jsonb not null default '{}'::jsonb,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_edge_no_self_loop check (from_node_id <> to_node_id),
  constraint civic_genome_edge_confidence_range check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1))
);

create table if not exists public.civic_genome_source_binding (
  binding_id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.civic_genome_node(node_id) on delete cascade,
  source_system text not null,
  source_table text not null,
  source_pk text not null,
  source_hash text,
  source_url text,
  source_payload_json jsonb not null default '{}'::jsonb,
  verification_status text not null default 'unverified',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_table, source_pk)
);

create index if not exists idx_civic_genome_node_type on public.civic_genome_node(node_type);
create index if not exists idx_civic_genome_node_domain on public.civic_genome_node(domain_key);
create index if not exists idx_civic_genome_node_jurisdiction on public.civic_genome_node(jurisdiction_level, jurisdiction);
create index if not exists idx_civic_genome_node_source on public.civic_genome_node(source_table, source_pk);
create index if not exists idx_civic_genome_edge_from on public.civic_genome_edge(from_node_id, relationship_type);
create index if not exists idx_civic_genome_edge_to on public.civic_genome_edge(to_node_id, relationship_type);
create index if not exists idx_civic_genome_binding_node on public.civic_genome_source_binding(node_id);

create or replace function public.touch_civic_genome_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_civic_genome_node_updated_at on public.civic_genome_node;
create trigger trg_civic_genome_node_updated_at
before update on public.civic_genome_node
for each row execute function public.touch_civic_genome_updated_at();

drop trigger if exists trg_civic_genome_edge_updated_at on public.civic_genome_edge;
create trigger trg_civic_genome_edge_updated_at
before update on public.civic_genome_edge
for each row execute function public.touch_civic_genome_updated_at();

drop trigger if exists trg_civic_genome_binding_updated_at on public.civic_genome_source_binding;
create trigger trg_civic_genome_binding_updated_at
before update on public.civic_genome_source_binding
for each row execute function public.touch_civic_genome_updated_at();

-- Initial deterministic projection from canonical SAIS resources.
insert into public.civic_genome_node (
  node_key,
  node_type,
  node_label,
  domain_key,
  jurisdiction_level,
  jurisdiction,
  lifecycle_status,
  verification_status,
  source_family_key,
  source_table,
  source_pk,
  attributes_json,
  provenance_json,
  first_seen_at,
  last_seen_at
)
select
  'sais_resource:' || sr.resource_id,
  'civic_resource',
  sr.organization_name,
  sr.resource_category,
  sr.jurisdiction_level,
  sr.jurisdiction,
  'active',
  coalesce(lower(sr.verification_status), 'unverified'),
  sr.family_key,
  'sais_resources',
  sr.resource_id,
  jsonb_build_object(
    'document_number', sr.document_number,
    'subcategory', sr.subcategory,
    'organization_type', sr.organization_type,
    'service_type', sr.service_type,
    'official_contact', sr.official_contact,
    'what_it_does', sr.what_it_does,
    'statutory_authority', sr.statutory_authority,
    'case_stage', sr.case_stage,
    'notes', sr.notes,
    'revision', sr.revision
  ),
  jsonb_build_object(
    'source_system', 'lighthouse',
    'source_table', 'sais_resources',
    'source_pk', sr.resource_id,
    'official_url', sr.official_url,
    'statutory_authority_url', sr.statutory_authority_url,
    'last_verified_at', sr.last_verified_at
  ),
  coalesce(sr.created_at, now()),
  coalesce(sr.updated_at, sr.created_at, now())
from public.sais_resources sr
on conflict (node_key) do update set
  node_label = excluded.node_label,
  domain_key = excluded.domain_key,
  jurisdiction_level = excluded.jurisdiction_level,
  jurisdiction = excluded.jurisdiction,
  verification_status = excluded.verification_status,
  attributes_json = excluded.attributes_json,
  provenance_json = excluded.provenance_json,
  last_seen_at = excluded.last_seen_at;

insert into public.civic_genome_source_binding (
  node_id,
  source_system,
  source_table,
  source_pk,
  source_url,
  source_payload_json,
  verification_status,
  first_seen_at,
  last_seen_at
)
select
  n.node_id,
  'lighthouse',
  'sais_resources',
  sr.resource_id,
  sr.official_url,
  jsonb_build_object(
    'resource_category', sr.resource_category,
    'subcategory', sr.subcategory,
    'service_type', sr.service_type,
    'statutory_authority_url', sr.statutory_authority_url
  ),
  coalesce(lower(sr.verification_status), 'unverified'),
  coalesce(sr.created_at, now()),
  coalesce(sr.updated_at, sr.created_at, now())
from public.sais_resources sr
join public.civic_genome_node n
  on n.node_key = 'sais_resource:' || sr.resource_id
on conflict (source_system, source_table, source_pk) do update set
  node_id = excluded.node_id,
  source_url = excluded.source_url,
  source_payload_json = excluded.source_payload_json,
  verification_status = excluded.verification_status,
  last_seen_at = excluded.last_seen_at;

create or replace view public.v_civic_genome_node_summary as
select
  n.node_id,
  n.node_key,
  n.node_type,
  n.node_label,
  n.domain_key,
  n.jurisdiction_level,
  n.jurisdiction,
  n.lifecycle_status,
  n.verification_status,
  n.source_family_key,
  n.source_table,
  n.source_pk,
  count(distinct eo.edge_id) as outgoing_edge_count,
  count(distinct ei.edge_id) as incoming_edge_count,
  n.first_seen_at,
  n.last_seen_at,
  n.updated_at
from public.civic_genome_node n
left join public.civic_genome_edge eo on eo.from_node_id = n.node_id
left join public.civic_genome_edge ei on ei.to_node_id = n.node_id
group by n.node_id;
