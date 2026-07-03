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
