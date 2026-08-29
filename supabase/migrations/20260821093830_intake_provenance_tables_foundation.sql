-- Reconstruct the empty intake staging/provenance substrate that existed live
-- before Lighthouse containment migrations referenced it. Only the verified
-- schema contract is restored; no intake or promotion rows are synthesized.

create table if not exists public.intake_staging (
  id bigserial primary key,
  source_file text not null,
  source_type text not null,
  destination_table text,
  source_record_id text,
  name text,
  acronym text,
  record_type text,
  phone text,
  email text,
  website text,
  complaint_url text,
  address text,
  state text,
  jurisdiction text,
  domains text[],
  org_type text,
  description text,
  service_type text,
  eligibility text,
  statutory_authority text,
  notes text,
  raw_payload jsonb,
  content_hash text,
  ingested_by text default 'script',
  intake_status text not null default 'staged',
  promoted_record_id text,
  promoted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.intake_promotion_log (
  id bigserial primary key,
  intake_staging_id bigint references public.intake_staging(id),
  registry_record_id text not null,
  source_file text,
  source_type text,
  record_name text,
  state text,
  content_hash text,
  hash_verified boolean default false,
  promoted_by text default 'script',
  promotion_run_id text,
  dry_run boolean default false,
  was_upsert boolean default false,
  success boolean not null default true,
  error_message text,
  created_at timestamptz default now()
);

alter table public.intake_staging enable row level security;
alter table public.intake_promotion_log enable row level security;

revoke all on public.intake_staging, public.intake_promotion_log
  from public, anon, authenticated;
grant select, insert, update, delete on public.intake_staging,
  public.intake_promotion_log to service_role;
grant usage, select on sequence public.intake_staging_id_seq,
  public.intake_promotion_log_id_seq to service_role;

drop policy if exists service_all_intake_staging on public.intake_staging;
create policy service_all_intake_staging on public.intake_staging
  for all to service_role using (true) with check (true);
drop policy if exists service_all_intake_promotion_log
  on public.intake_promotion_log;
create policy service_all_intake_promotion_log
  on public.intake_promotion_log
  for all to service_role using (true) with check (true);

create or replace view public.registry_record_provenance
with (security_invoker = true) as
select
  registry.id as registry_record_id,
  registry.name,
  staging.state,
  promotion.source_file,
  staging.content_hash as ingested_hash,
  promotion.content_hash as promoted_hash,
  promotion.hash_verified,
  promotion.promoted_by,
  promotion.promotion_run_id,
  promotion.dry_run,
  promotion.was_upsert,
  promotion.created_at as promoted_at,
  staging.created_at as ingested_at,
  staging.source_type,
  staging.raw_payload
from public.registry_programs registry
left join public.intake_promotion_log promotion
  on promotion.registry_record_id = registry.id
 and promotion.success = true
left join public.intake_staging staging
  on staging.id = promotion.intake_staging_id;

revoke all on public.registry_record_provenance
  from public, anon, authenticated, service_role;
grant select on public.registry_record_provenance to service_role;

comment on table public.intake_staging is
  'Service-only empty intake staging substrate reconstructed for executable migration replay.';
comment on table public.intake_promotion_log is
  'Service-only empty intake promotion ledger reconstructed for executable migration replay.';
comment on view public.registry_record_provenance is
  'Service-only security-invoker provenance projection reconstructed from the verified live contract.';
