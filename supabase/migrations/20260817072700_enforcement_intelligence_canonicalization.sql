begin;

create schema if not exists private;

create table if not exists private.enforcement_intelligence_duplicate_archive (
  source_table text not null,
  source_id integer not null,
  canonical_id integer not null,
  source_payload jsonb not null,
  archive_reason text not null,
  archived_at timestamptz not null default clock_timestamp(),
  primary key (source_table, source_id)
);

alter table private.enforcement_intelligence_duplicate_archive enable row level security;
revoke all on private.enforcement_intelligence_duplicate_archive from public, anon, authenticated;
grant usage on schema private to service_role;
grant select on private.enforcement_intelligence_duplicate_archive to service_role;

alter table public.agency_forms
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists source_as_of date;

alter table public.regulatory_guidance
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists source_as_of date;

alter table public.enforcement_penalties
  add column if not exists authority_citation text,
  add column if not exists source_url text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists source_as_of date;

alter table public.enforcement_viability_rules
  add column if not exists authority_citation text,
  add column if not exists source_url text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists source_as_of date;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'agency_forms',
    'regulatory_guidance',
    'enforcement_penalties',
    'enforcement_viability_rules'
  ] loop
    if not exists (
      select 1
        from pg_constraint
       where conname = target_table || '_verification_status_check'
         and conrelid = format('public.%I', target_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (verification_status in (''unverified'', ''in_review'', ''verified'', ''superseded''))',
        target_table,
        target_table || '_verification_status_check'
      );
    end if;
  end loop;
end
$$;

with ranked as (
  select form.*,
         min(id) over (
           partition by agency, agency_short, form_name,
                        coalesce(form_number, ''), coalesce(pipeline_category, '')
         ) as canonical_id,
         row_number() over (
           partition by agency, agency_short, form_name,
                        coalesce(form_number, ''), coalesce(pipeline_category, '')
           order by id
         ) as duplicate_rank
    from public.agency_forms form
), archived as (
  insert into private.enforcement_intelligence_duplicate_archive (
    source_table, source_id, canonical_id, source_payload, archive_reason
  )
  select 'agency_forms', id, canonical_id,
         to_jsonb(ranked) - 'canonical_id' - 'duplicate_rank',
         'Exact repeated seed identity; canonical row is the lowest id'
    from ranked
   where duplicate_rank > 1
  on conflict (source_table, source_id) do nothing
  returning source_id
)
delete from public.agency_forms form
 using archived
 where form.id = archived.source_id;

with ranked as (
  select guidance.*,
         min(id) over (
           partition by agency, agency_short, document_title, issue_area,
                        guidance_type, coalesce(citation, ''),
                        coalesce(publication_date, ''), coalesce(pipeline_category, '')
         ) as canonical_id,
         row_number() over (
           partition by agency, agency_short, document_title, issue_area,
                        guidance_type, coalesce(citation, ''),
                        coalesce(publication_date, ''), coalesce(pipeline_category, '')
           order by id
         ) as duplicate_rank
    from public.regulatory_guidance guidance
), archived as (
  insert into private.enforcement_intelligence_duplicate_archive (
    source_table, source_id, canonical_id, source_payload, archive_reason
  )
  select 'regulatory_guidance', id, canonical_id,
         to_jsonb(ranked) - 'canonical_id' - 'duplicate_rank',
         'Exact repeated seed identity; canonical row is the lowest id'
    from ranked
   where duplicate_rank > 1
  on conflict (source_table, source_id) do nothing
  returning source_id
)
delete from public.regulatory_guidance guidance
 using archived
 where guidance.id = archived.source_id;

with ranked as (
  select penalty.*,
         min(id) over (
           partition by agency, agency_short, violation_type,
                        coalesce(pipeline_category, '')
         ) as canonical_id,
         row_number() over (
           partition by agency, agency_short, violation_type,
                        coalesce(pipeline_category, '')
           order by id
         ) as duplicate_rank
    from public.enforcement_penalties penalty
), archived as (
  insert into private.enforcement_intelligence_duplicate_archive (
    source_table, source_id, canonical_id, source_payload, archive_reason
  )
  select 'enforcement_penalties', id, canonical_id,
         to_jsonb(ranked) - 'canonical_id' - 'duplicate_rank',
         'Exact repeated seed identity; canonical row is the lowest id'
    from ranked
   where duplicate_rank > 1
  on conflict (source_table, source_id) do nothing
  returning source_id
)
delete from public.enforcement_penalties penalty
 using archived
 where penalty.id = archived.source_id;

with ranked as (
  select viability.*,
         min(id) over (
           partition by claim_type, jurisdiction, agency, agency_short,
                        pipeline_category
         ) as canonical_id,
         row_number() over (
           partition by claim_type, jurisdiction, agency, agency_short,
                        pipeline_category
           order by id
         ) as duplicate_rank
    from public.enforcement_viability_rules viability
), archived as (
  insert into private.enforcement_intelligence_duplicate_archive (
    source_table, source_id, canonical_id, source_payload, archive_reason
  )
  select 'enforcement_viability_rules', id, canonical_id,
         to_jsonb(ranked) - 'canonical_id' - 'duplicate_rank',
         'Exact repeated seed identity; canonical row is the lowest id'
    from ranked
   where duplicate_rank > 1
  on conflict (source_table, source_id) do nothing
  returning source_id
)
delete from public.enforcement_viability_rules viability
 using archived
 where viability.id = archived.source_id;

update public.enforcement_penalties
   set statutory_max_penalty = case
         when lower(btrim(coalesce(statutory_max_penalty, ''))) in ('varies', 'varies by violation') then null
         else statutory_max_penalty
       end,
       average_penalty = case
         when lower(btrim(coalesce(average_penalty, ''))) in ('varies', 'varies by violation') then null
         else average_penalty
       end,
       typical_settlement_range = case
         when lower(btrim(coalesce(typical_settlement_range, ''))) in ('varies', 'varies by violation') then null
         else typical_settlement_range
       end;

create unique index if not exists uq_agency_forms_canonical_identity
  on public.agency_forms (
    lower(btrim(agency)),
    lower(btrim(agency_short)),
    lower(btrim(form_name)),
    lower(btrim(coalesce(form_number, ''))),
    lower(btrim(coalesce(pipeline_category, '')))
  );

create unique index if not exists uq_regulatory_guidance_canonical_identity
  on public.regulatory_guidance (
    lower(btrim(agency)),
    lower(btrim(agency_short)),
    lower(btrim(document_title)),
    lower(btrim(issue_area)),
    lower(btrim(guidance_type)),
    lower(btrim(coalesce(citation, ''))),
    lower(btrim(coalesce(publication_date, ''))),
    lower(btrim(coalesce(pipeline_category, '')))
  );

create unique index if not exists uq_enforcement_penalties_canonical_identity
  on public.enforcement_penalties (
    lower(btrim(agency)),
    lower(btrim(agency_short)),
    lower(btrim(violation_type)),
    lower(btrim(coalesce(pipeline_category, '')))
  );

create unique index if not exists uq_enforcement_viability_rules_canonical_identity
  on public.enforcement_viability_rules (
    lower(btrim(claim_type)),
    lower(btrim(jurisdiction)),
    lower(btrim(agency)),
    lower(btrim(agency_short)),
    lower(btrim(pipeline_category))
  );

create index if not exists idx_agency_forms_verification_status
  on public.agency_forms (verification_status);
create index if not exists idx_regulatory_guidance_verification_status
  on public.regulatory_guidance (verification_status);
create index if not exists idx_enforcement_penalties_verification_status
  on public.enforcement_penalties (verification_status);
create index if not exists idx_enforcement_viability_rules_verification_status
  on public.enforcement_viability_rules (verification_status);

comment on table private.enforcement_intelligence_duplicate_archive is
  'Recoverable archive of repeated Enforcement Intelligence seed rows removed during canonicalization.';
comment on column public.enforcement_penalties.authority_citation is
  'Controlling authority for any displayed penalty value; null means no authority is attached.';
comment on column public.enforcement_penalties.source_url is
  'Supporting source for the penalty value or enforcement outcome; null means source needed.';

commit;
