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
         jsonb_build_object('source_column','contact','source_key',key,'backfill_migration','contacts_registry_jsonb_backfill') as provenance
  from source_contacts
)
insert into public.contacts (entity_type, entity_table, entity_id, contact_type, value, label, is_primary, source, provenance)
select entity_type, entity_table, entity_id, contact_type, value, label, false, source, provenance
from normalized
where value <> ''
on conflict do nothing;
