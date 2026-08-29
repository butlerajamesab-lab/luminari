create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_table text,
  entity_id text not null,
  contact_type text not null check (contact_type in ('email', 'phone', 'url', 'address', 'text_contact')),
  value text not null,
  label text,
  is_primary boolean not null default false,
  source text,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contacts_unique_per_entity
  on public.contacts (entity_type, entity_id, contact_type, lower(value));

create index if not exists contacts_entity_lookup
  on public.contacts (entity_type, entity_id);

create index if not exists contacts_entity_table_lookup
  on public.contacts (entity_table, entity_id);

create index if not exists contacts_type_value_lookup
  on public.contacts (contact_type, lower(value));

alter table public.contacts enable row level security;

create or replace function public.normalize_contact_type(p_key text, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_key,'') ilike '%email%' or coalesce(p_value,'') ~* '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then 'email'
    when coalesce(p_key,'') ilike '%phone%' or coalesce(p_key,'') ilike '%tel%' or coalesce(p_value,'') ~* '^\+?[0-9][0-9 .()\-]{6,}$' then 'phone'
    when coalesce(p_key,'') ilike '%url%' or coalesce(p_key,'') ilike '%website%' or coalesce(p_value,'') ~* '^https?://' then 'url'
    when coalesce(p_key,'') ilike '%addr%' or coalesce(p_key,'') ilike '%address%' then 'address'
    else 'text_contact'
  end;
$$;

create or replace function public.set_contacts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_contacts_updated_at();

-- Registry sources predate complete migration tracking. Build the canonical
-- contacts substrate unconditionally, but run each backfill only when its
-- complete legacy source contract is available.
do $compatibility$
declare
  missing_prerequisites integer;
begin
  select count(*)
    into missing_prerequisites
  from (values
    ('committee_registry', 'uuid'), ('committee_registry', 'contact'),
    ('grants_registry', 'uuid'), ('grants_registry', 'contact'),
    ('legislator_registry', 'uuid'), ('legislator_registry', 'contact'),
    ('nonprofit_registry', 'uuid'), ('nonprofit_registry', 'contact'),
    ('oversight_registry', 'uuid'), ('oversight_registry', 'contact')
  ) required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if missing_prerequisites = 0 then
    execute $backfill$
with source_contacts as (
  select 'committee' as entity_type, 'committee_registry' as entity_table, uuid::text as entity_id, key, value, 'committee_registry.contact' as source
  from public.committee_registry cross join lateral jsonb_each_text(contact)
  where contact is not null and jsonb_typeof(contact) = 'object' and trim(value) <> ''
  union all
  select 'grant', 'grants_registry', uuid::text, key, value, 'grants_registry.contact'
  from public.grants_registry cross join lateral jsonb_each_text(contact)
  where contact is not null and jsonb_typeof(contact) = 'object' and trim(value) <> ''
  union all
  select 'legislator', 'legislator_registry', uuid::text, key, value, 'legislator_registry.contact'
  from public.legislator_registry cross join lateral jsonb_each_text(contact)
  where contact is not null and jsonb_typeof(contact) = 'object' and trim(value) <> ''
  union all
  select 'nonprofit', 'nonprofit_registry', uuid::text, key, value, 'nonprofit_registry.contact'
  from public.nonprofit_registry cross join lateral jsonb_each_text(contact)
  where contact is not null and jsonb_typeof(contact) = 'object' and trim(value) <> ''
  union all
  select 'oversight', 'oversight_registry', uuid::text, key, value, 'oversight_registry.contact'
  from public.oversight_registry cross join lateral jsonb_each_text(contact)
  where contact is not null and jsonb_typeof(contact) = 'object' and trim(value) <> ''
), normalized as (
  select entity_type, entity_table, entity_id, public.normalize_contact_type(key, value) as contact_type, trim(value) as value, key as label, source,
         jsonb_build_object('source_column','contact','source_key',key,'backfill_migration','create_canonical_contacts_backfill_registry_contacts') as provenance
  from source_contacts
)
insert into public.contacts (entity_type, entity_table, entity_id, contact_type, value, label, is_primary, source, provenance)
select entity_type, entity_table, entity_id, contact_type, value, label, false, source, provenance
from normalized
where value <> ''
on conflict do nothing
    $backfill$;
  end if;
end
$compatibility$;

do $compatibility$
declare
  missing_prerequisites integer;
begin
  select count(*)
    into missing_prerequisites
  from (values
    ('committee_registry', 'uuid'),
    ('committee_registry', 'contact_email_norm'),
    ('committee_registry', 'contact_phone_norm'),
    ('committee_registry', 'contact_website_norm'),
    ('committee_registry', 'contact_physical_address_norm'),
    ('grants_registry', 'uuid'),
    ('grants_registry', 'contact_email_norm'),
    ('grants_registry', 'contact_phone_norm'),
    ('grants_registry', 'contact_website_norm'),
    ('grants_registry', 'contact_physical_address_norm'),
    ('legislator_registry', 'uuid'),
    ('legislator_registry', 'contact_email_norm'),
    ('legislator_registry', 'contact_phone_norm'),
    ('legislator_registry', 'contact_website_norm'),
    ('legislator_registry', 'contact_physical_address_norm'),
    ('nonprofit_registry', 'uuid'),
    ('nonprofit_registry', 'contact_email_norm'),
    ('nonprofit_registry', 'contact_phone_norm'),
    ('nonprofit_registry', 'contact_website_norm'),
    ('nonprofit_registry', 'contact_physical_address_norm'),
    ('oversight_registry', 'uuid'),
    ('oversight_registry', 'contact_email_norm'),
    ('oversight_registry', 'contact_phone_norm'),
    ('oversight_registry', 'contact_website_norm'),
    ('oversight_registry', 'contact_physical_address_norm')
  ) required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if missing_prerequisites = 0 then
    execute $backfill$
with registry_rows as (
  select 'committee' as entity_type, 'committee_registry' as entity_table, uuid::text as entity_id, contact_email_norm, contact_phone_norm, contact_website_norm, contact_physical_address_norm from public.committee_registry
  union all
  select 'grant', 'grants_registry', uuid::text, contact_email_norm, contact_phone_norm, contact_website_norm, contact_physical_address_norm from public.grants_registry
  union all
  select 'legislator', 'legislator_registry', uuid::text, contact_email_norm, contact_phone_norm, contact_website_norm, contact_physical_address_norm from public.legislator_registry
  union all
  select 'nonprofit', 'nonprofit_registry', uuid::text, contact_email_norm, contact_phone_norm, contact_website_norm, contact_physical_address_norm from public.nonprofit_registry
  union all
  select 'oversight', 'oversight_registry', uuid::text, contact_email_norm, contact_phone_norm, contact_website_norm, contact_physical_address_norm from public.oversight_registry
), exploded as (
  select entity_type, entity_table, entity_id, 'email' as contact_type, trim(contact_email_norm) as value, 'normalized_email' as label, entity_table || '.contact_email_norm' as source from registry_rows where nullif(trim(coalesce(contact_email_norm,'')),'') is not null
  union all
  select entity_type, entity_table, entity_id, 'phone', trim(contact_phone_norm), 'normalized_phone', entity_table || '.contact_phone_norm' from registry_rows where nullif(trim(coalesce(contact_phone_norm,'')),'') is not null
  union all
  select entity_type, entity_table, entity_id, 'url', trim(contact_website_norm), 'normalized_website', entity_table || '.contact_website_norm' from registry_rows where nullif(trim(coalesce(contact_website_norm,'')),'') is not null
  union all
  select entity_type, entity_table, entity_id, 'address', trim(contact_physical_address_norm), 'normalized_physical_address', entity_table || '.contact_physical_address_norm' from registry_rows where nullif(trim(coalesce(contact_physical_address_norm,'')),'') is not null
)
insert into public.contacts (entity_type, entity_table, entity_id, contact_type, value, label, is_primary, source, provenance)
select entity_type, entity_table, entity_id, contact_type, value, label, false, source,
       jsonb_build_object('source_column', split_part(source,'.',2), 'backfill_migration','create_canonical_contacts_backfill_registry_contacts')
from exploded
on conflict do nothing
    $backfill$;
  end if;
end
$compatibility$;

do $compatibility$
declare
  prerequisite_count integer;
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'registry_programs'
    and column_name = any(array['id', 'contact']);

  if prerequisite_count = 2 then
    execute $backfill$
insert into public.contacts (entity_type, entity_table, entity_id, contact_type, value, label, is_primary, source, provenance)
select 'program', 'registry_programs', id::text, 'text_contact', trim(contact), 'legacy_text_contact', true, 'registry_programs.contact',
       jsonb_build_object('source_column','contact','source_type','text','backfill_migration','create_canonical_contacts_backfill_registry_contacts')
from public.registry_programs
where nullif(trim(coalesce(contact,'')),'') is not null
on conflict do nothing
    $backfill$;
  end if;
end
$compatibility$;

update public.contacts c
set is_primary = true
where not is_primary
  and c.id in (
    select distinct on (entity_type, entity_id, contact_type) id
    from public.contacts
    where contact_type in ('email','phone','url','address')
    order by entity_type, entity_id, contact_type, created_at, id
  );

create or replace view public.v_contacts_entity_summary
with (security_invoker = true)
as
select
  entity_type,
  entity_table,
  entity_id,
  jsonb_object_agg(contact_type, value order by is_primary desc, created_at) filter (where contact_type in ('email','phone','url','address','text_contact')) as contact,
  count(*) as contact_count,
  max(updated_at) as updated_at
from public.contacts
group by entity_type, entity_table, entity_id;

select entity_type, entity_table, contact_type, count(*) as contact_rows
from public.contacts
group by entity_type, entity_table, contact_type
order by entity_type, entity_table, contact_type;
