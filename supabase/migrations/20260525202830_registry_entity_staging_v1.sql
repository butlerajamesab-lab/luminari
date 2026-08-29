create table if not exists public.registry_entity_staging_v1 (
  id bigserial primary key,
  source_file text,
  layer text,
  category text,
  region_group text,
  entity_name text,
  entity_type text,
  phone text,
  website_url text,
  email text,
  address text,
  eligibility_raw text,
  application_raw text,
  raw_payload jsonb,
  extracted_at timestamptz default now()
);

create index if not exists idx_registry_entity_staging_name
on public.registry_entity_staging_v1(entity_name);

create index if not exists idx_registry_entity_staging_category
on public.registry_entity_staging_v1(category);

create index if not exists idx_registry_entity_staging_region
on public.registry_entity_staging_v1(region_group);
