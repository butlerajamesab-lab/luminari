begin;

create extension if not exists pgcrypto;

create table if not exists public.civic_genome_rosetta_generation_binding (
  generation_binding_id uuid primary key default gen_random_uuid(),
  source_document_id bigint not null,
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_identity_hash text not null,
  source_content_hash text not null,
  source_url text not null,
  source_version text not null,
  rosetta_engine_version text not null,
  rosetta_rule_set_version text not null,
  rosetta_rule_manifest_hash text not null,
  rosetta_configuration_hash text not null,
  rosetta_output_content_hash text not null,
  generation_fingerprint text not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint civic_genome_rosetta_generation_source_identity_hash_format
    check (source_identity_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_rosetta_generation_source_content_hash_format
    check (source_content_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_rosetta_generation_rule_manifest_hash_format
    check (rosetta_rule_manifest_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_rosetta_generation_configuration_hash_format
    check (rosetta_configuration_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_rosetta_generation_output_hash_format
    check (rosetta_output_content_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_rosetta_generation_fingerprint_format
    check (generation_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_rosetta_generation_unique
    unique (source_document_id, generation_fingerprint)
);

create index if not exists idx_civic_genome_rosetta_generation_bill
  on public.civic_genome_rosetta_generation_binding(
    genome_bill_id,
    source_document_id,
    observed_at desc
  );

alter table public.civic_genome_rosetta_generation_binding enable row level security;

revoke all on table public.civic_genome_rosetta_generation_binding
  from public, anon, authenticated;
grant select, insert on table public.civic_genome_rosetta_generation_binding
  to service_role;

create or replace function public.civic_genome_rosetta_generation_fingerprint(
  p_source_document_id bigint,
  p_genome_bill_id uuid,
  p_source_identity_hash text,
  p_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_rosetta_engine_version text,
  p_rosetta_rule_set_version text,
  p_rosetta_rule_manifest_hash text,
  p_rosetta_configuration_hash text,
  p_rosetta_output_content_hash text
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select encode(
    digest(
      convert_to(
        jsonb_build_object(
          'source_document_id', p_source_document_id,
          'genome_bill_id', p_genome_bill_id,
          'source_identity_hash', p_source_identity_hash,
          'source_content_hash', p_source_content_hash,
          'source_url', p_source_url,
          'source_version', p_source_version,
          'rosetta_engine_version', p_rosetta_engine_version,
          'rosetta_rule_set_version', p_rosetta_rule_set_version,
          'rosetta_rule_manifest_hash', p_rosetta_rule_manifest_hash,
          'rosetta_configuration_hash', p_rosetta_configuration_hash,
          'rosetta_output_content_hash', p_rosetta_output_content_hash
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.civic_genome_rosetta_generation_fingerprint(
  bigint, uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.civic_genome_rosetta_generation_fingerprint(
  bigint, uuid, text, text, text, text, text, text, text, text, text
) to service_role;

create or replace function public.insert_civic_genome_rosetta_generation_binding(
  p_source_document_id bigint,
  p_genome_bill_id uuid,
  p_source_identity_hash text,
  p_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_rosetta_engine_version text,
  p_rosetta_rule_set_version text,
  p_rosetta_rule_manifest_hash text,
  p_rosetta_configuration_hash text,
  p_rosetta_output_content_hash text,
  p_observed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fingerprint text;
begin
  if p_source_identity_hash is null
     or p_source_content_hash is null
     or nullif(btrim(p_source_url), '') is null
     or nullif(btrim(p_source_version), '') is null
     or nullif(btrim(p_rosetta_engine_version), '') is null
     or nullif(btrim(p_rosetta_rule_set_version), '') is null
     or p_rosetta_rule_manifest_hash is null
     or p_rosetta_configuration_hash is null
     or p_rosetta_output_content_hash is null then
    raise exception using
      errcode = '22023',
      message = 'rosetta_generation_receipt_incomplete';
  end if;

  v_fingerprint := public.civic_genome_rosetta_generation_fingerprint(
    p_source_document_id,
    p_genome_bill_id,
    p_source_identity_hash,
    p_source_content_hash,
    p_source_url,
    p_source_version,
    p_rosetta_engine_version,
    p_rosetta_rule_set_version,
    p_rosetta_rule_manifest_hash,
    p_rosetta_configuration_hash,
    p_rosetta_output_content_hash
  );

  insert into public.civic_genome_rosetta_generation_binding (
    source_document_id,
    genome_bill_id,
    source_identity_hash,
    source_content_hash,
    source_url,
    source_version,
    rosetta_engine_version,
    rosetta_rule_set_version,
    rosetta_rule_manifest_hash,
    rosetta_configuration_hash,
    rosetta_output_content_hash,
    generation_fingerprint,
    observed_at
  ) values (
    p_source_document_id,
    p_genome_bill_id,
    p_source_identity_hash,
    p_source_content_hash,
    p_source_url,
    p_source_version,
    p_rosetta_engine_version,
    p_rosetta_rule_set_version,
    p_rosetta_rule_manifest_hash,
    p_rosetta_configuration_hash,
    p_rosetta_output_content_hash,
    v_fingerprint,
    coalesce(p_observed_at, now())
  )
  on conflict (source_document_id, generation_fingerprint) do nothing;
end;
$$;

revoke all on function public.insert_civic_genome_rosetta_generation_binding(
  bigint, uuid, text, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.insert_civic_genome_rosetta_generation_binding(
  bigint, uuid, text, text, text, text, text, text, text, text, text, timestamptz
) to service_role;

create or replace function public.guard_civic_genome_rosetta_source_generation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.civic_genome_rosetta_source_binding%rowtype;
begin
  select *
    into v_existing
  from public.civic_genome_rosetta_source_binding
  where source_document_id = new.source_document_id
  for update;

  if not found then
    return new;
  end if;

  if v_existing.genome_bill_id is distinct from new.genome_bill_id then
    raise exception using
      errcode = '23505',
      message = 'rosetta_source_document_already_bound_to_other_bill';
  end if;

  if v_existing.source_identity_hash is distinct from new.source_identity_hash
     or v_existing.source_content_hash is distinct from new.source_content_hash
     or v_existing.source_url is distinct from new.source_url
     or v_existing.source_version is distinct from new.source_version then
    raise exception using
      errcode = '22000',
      message = 'rosetta_source_identity_binding_changed';
  end if;

  perform public.insert_civic_genome_rosetta_generation_binding(
    v_existing.source_document_id,
    v_existing.genome_bill_id,
    v_existing.source_identity_hash,
    v_existing.source_content_hash,
    v_existing.source_url,
    v_existing.source_version,
    v_existing.rosetta_engine_version,
    v_existing.rosetta_rule_set_version,
    v_existing.rosetta_rule_manifest_hash,
    v_existing.rosetta_configuration_hash,
    v_existing.rosetta_output_content_hash,
    v_existing.updated_at
  );

  perform public.insert_civic_genome_rosetta_generation_binding(
    new.source_document_id,
    new.genome_bill_id,
    new.source_identity_hash,
    new.source_content_hash,
    new.source_url,
    new.source_version,
    new.rosetta_engine_version,
    new.rosetta_rule_set_version,
    new.rosetta_rule_manifest_hash,
    new.rosetta_configuration_hash,
    new.rosetta_output_content_hash,
    now()
  );

  update public.civic_genome_rosetta_source_binding
     set rosetta_engine_version = new.rosetta_engine_version,
         rosetta_rule_set_version = new.rosetta_rule_set_version,
         rosetta_rule_manifest_hash = new.rosetta_rule_manifest_hash,
         rosetta_configuration_hash = new.rosetta_configuration_hash,
         rosetta_output_content_hash = new.rosetta_output_content_hash,
         updated_at = now()
   where source_document_id = new.source_document_id;

  return null;
end;
$$;

revoke all on function public.guard_civic_genome_rosetta_source_generation()
  from public, anon, authenticated;

drop trigger if exists civic_genome_rosetta_source_generation_guard
  on public.civic_genome_rosetta_source_binding;
create trigger civic_genome_rosetta_source_generation_guard
before insert on public.civic_genome_rosetta_source_binding
for each row execute function public.guard_civic_genome_rosetta_source_generation();

create or replace function public.record_initial_civic_genome_rosetta_generation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.insert_civic_genome_rosetta_generation_binding(
    new.source_document_id,
    new.genome_bill_id,
    new.source_identity_hash,
    new.source_content_hash,
    new.source_url,
    new.source_version,
    new.rosetta_engine_version,
    new.rosetta_rule_set_version,
    new.rosetta_rule_manifest_hash,
    new.rosetta_configuration_hash,
    new.rosetta_output_content_hash,
    new.updated_at
  );
  return new;
end;
$$;

revoke all on function public.record_initial_civic_genome_rosetta_generation()
  from public, anon, authenticated;

drop trigger if exists civic_genome_rosetta_initial_generation_record
  on public.civic_genome_rosetta_source_binding;
create trigger civic_genome_rosetta_initial_generation_record
after insert on public.civic_genome_rosetta_source_binding
for each row execute function public.record_initial_civic_genome_rosetta_generation();

create or replace function public.reject_civic_genome_rosetta_generation_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'civic_genome_rosetta_generation_binding_is_immutable';
end;
$$;

revoke all on function public.reject_civic_genome_rosetta_generation_mutation()
  from public, anon, authenticated;

drop trigger if exists civic_genome_rosetta_generation_immutable
  on public.civic_genome_rosetta_generation_binding;
create trigger civic_genome_rosetta_generation_immutable
before update or delete on public.civic_genome_rosetta_generation_binding
for each row execute function public.reject_civic_genome_rosetta_generation_mutation();

insert into public.civic_genome_rosetta_generation_binding (
  source_document_id,
  genome_bill_id,
  source_identity_hash,
  source_content_hash,
  source_url,
  source_version,
  rosetta_engine_version,
  rosetta_rule_set_version,
  rosetta_rule_manifest_hash,
  rosetta_configuration_hash,
  rosetta_output_content_hash,
  generation_fingerprint,
  observed_at
)
select
  binding.source_document_id,
  binding.genome_bill_id,
  binding.source_identity_hash,
  binding.source_content_hash,
  binding.source_url,
  binding.source_version,
  binding.rosetta_engine_version,
  binding.rosetta_rule_set_version,
  binding.rosetta_rule_manifest_hash,
  binding.rosetta_configuration_hash,
  binding.rosetta_output_content_hash,
  public.civic_genome_rosetta_generation_fingerprint(
    binding.source_document_id,
    binding.genome_bill_id,
    binding.source_identity_hash,
    binding.source_content_hash,
    binding.source_url,
    binding.source_version,
    binding.rosetta_engine_version,
    binding.rosetta_rule_set_version,
    binding.rosetta_rule_manifest_hash,
    binding.rosetta_configuration_hash,
    binding.rosetta_output_content_hash
  ),
  binding.updated_at
from public.civic_genome_rosetta_source_binding binding
where binding.source_content_hash is not null
  and binding.source_url is not null
  and binding.source_version is not null
  and binding.rosetta_engine_version is not null
  and binding.rosetta_rule_set_version is not null
  and binding.rosetta_rule_manifest_hash is not null
  and binding.rosetta_configuration_hash is not null
  and binding.rosetta_output_content_hash is not null
on conflict (source_document_id, generation_fingerprint) do nothing;

comment on table public.civic_genome_rosetta_generation_binding is
  'Immutable history of every Rosetta engine/rule/configuration/output generation observed for one fixed source-document identity.';
comment on table public.civic_genome_rosetta_source_binding is
  'Stable one-document-to-one-Genome-bill source identity binding. Rosetta generation history is immutable in civic_genome_rosetta_generation_binding; generation columns here are a latest compatibility mirror for the existing assembly adapter.';
comment on function public.guard_civic_genome_rosetta_source_generation() is
  'Rejects source-identity drift, preserves each Rosetta generation immutably, and updates only the compatibility mirror needed by the existing assembly adapter.';

commit;
