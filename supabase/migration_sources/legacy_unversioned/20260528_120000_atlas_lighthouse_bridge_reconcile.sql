begin;

alter table if exists public.atlas_lighthouse_resource_bridge_v1
  add column if not exists lighthouse_resource_id uuid;

update public.atlas_lighthouse_resource_bridge_v1
set lighthouse_resource_id = atlas_resource_id
where lighthouse_resource_id is null
  and atlas_resource_id is not null;

create index if not exists idx_bridge_lighthouse_resource
  on public.atlas_lighthouse_resource_bridge_v1(lighthouse_resource_id);

commit;
