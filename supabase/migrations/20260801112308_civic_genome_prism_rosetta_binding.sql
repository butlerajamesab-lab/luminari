create extension if not exists pgcrypto with schema extensions;

create table if not exists public.civic_genome_prism_verification_binding (
  binding_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id),
  assembly_run_id uuid not null references public.civic_genome_assembly_run(assembly_run_id),
  trait_id uuid not null references public.civic_genome_trait(trait_id),
  source_document_id bigint not null,
  extraction_run_id text not null,
  source_object_id text not null,
  request_id text not null unique references public.lighthouse_prism_verification_requests(request_id),
  prism_verification_receipt_id uuid not null unique
    references public.lighthouse_prism_verification_receipts(prism_verification_receipt_id),
  prism_engine_version text not null,
  prism_rule_set_id text not null,
  prism_rule_set_version text not null,
  prism_rule_set_hash text not null check (prism_rule_set_hash ~ '^[a-f0-9]{64}$'),
  verification_status text not null check (verification_status in (
    'user_reported',
    'document_stated',
    'supported_by_one_source',
    'supported_by_multiple_sources',
    'contradicted',
    'disputed',
    'incomplete',
    'unresolved',
    'verified'
  )),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  deterministic_replay_key text not null check (deterministic_replay_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (trait_id, prism_rule_set_id, prism_rule_set_version)
);

create table if not exists public.civic_genome_prism_verification_run (
  verification_run_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id),
  assembly_run_id uuid not null references public.civic_genome_assembly_run(assembly_run_id),
  source_document_id bigint not null,
  extraction_run_id text not null,
  prism_engine_version text not null,
  prism_rule_set_id text not null,
  prism_rule_set_version text not null,
  expected_trait_count integer not null check (expected_trait_count > 0),
  receipt_count integer not null check (receipt_count > 0),
  status_counts jsonb not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  receipt_manifest_hash text not null check (receipt_manifest_hash ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (receipt_count = expected_trait_count),
  unique (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
);

create index if not exists civic_genome_prism_binding_bill_idx
  on public.civic_genome_prism_verification_binding(genome_bill_id, created_at desc);
create index if not exists civic_genome_prism_binding_status_idx
  on public.civic_genome_prism_verification_binding(verification_status, created_at desc);
create index if not exists civic_genome_prism_run_bill_idx
  on public.civic_genome_prism_verification_run(genome_bill_id, completed_at desc);

create or replace function public.prevent_civic_genome_prism_verification_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Civic Genome Prism verification records are immutable';
end;
$$;

drop trigger if exists civic_genome_prism_binding_immutable
  on public.civic_genome_prism_verification_binding;
create trigger civic_genome_prism_binding_immutable
before update or delete on public.civic_genome_prism_verification_binding
for each row execute function public.prevent_civic_genome_prism_verification_mutation();

drop trigger if exists civic_genome_prism_run_immutable
  on public.civic_genome_prism_verification_run;
create trigger civic_genome_prism_run_immutable
before update or delete on public.civic_genome_prism_verification_run
for each row execute function public.prevent_civic_genome_prism_verification_mutation();

create or replace view public.v_civic_genome_prism_verification_status
with (security_invoker = true)
as
select
  trait.trait_id,
  trait.genome_bill_id,
  trait.trait_class,
  trait.trait_key,
  trait.source_object_id,
  trait.content_hash as trait_content_hash,
  binding.binding_id,
  binding.assembly_run_id,
  binding.request_id,
  binding.prism_verification_receipt_id,
  binding.prism_engine_version,
  binding.prism_rule_set_id,
  binding.prism_rule_set_version,
  binding.verification_status,
  binding.input_hash,
  binding.output_hash,
  binding.deterministic_replay_key,
  binding.created_at as verified_at
from public.civic_genome_trait trait
left join public.civic_genome_prism_verification_binding binding
  on binding.trait_id = trait.trait_id;

alter table public.civic_genome_prism_verification_binding enable row level security;
alter table public.civic_genome_prism_verification_binding force row level security;
alter table public.civic_genome_prism_verification_run enable row level security;
alter table public.civic_genome_prism_verification_run force row level security;

revoke all on table public.civic_genome_prism_verification_binding
  from public, anon, authenticated;
revoke all on table public.civic_genome_prism_verification_run
  from public, anon, authenticated;
revoke all on table public.v_civic_genome_prism_verification_status
  from public, anon, authenticated;

grant select, insert on table public.civic_genome_prism_verification_binding
  to service_role;
grant select, insert on table public.civic_genome_prism_verification_run
  to service_role;
grant select on table public.v_civic_genome_prism_verification_status
  to service_role;

revoke execute on function public.prevent_civic_genome_prism_verification_mutation()
  from public, anon, authenticated;
