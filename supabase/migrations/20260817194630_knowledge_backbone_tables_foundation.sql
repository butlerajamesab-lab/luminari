-- Reconstruct the three Knowledge Backbone relations that existed live before
-- their publication-quarantine migration entered source control. Production
-- has zero rows in all three relations, so this migration restores only the
-- verified schema contract; it does not fabricate corpus content.

create table if not exists public.knowledge_modules (
  id serial primary key,
  module_type text,
  module_name text,
  description text,
  source_file text,
  total_entries integer,
  version text,
  loaded_at bigint,
  is_active integer
);

create table if not exists public.knowledge_entries (
  id serial primary key,
  module_id integer,
  entry_id text,
  entry_name text,
  category text,
  severity text,
  domain text,
  payload text,
  tags text,
  cross_ref_modules text,
  created_at bigint
);

create table if not exists public.knowledge_cross_refs (
  id serial primary key,
  source_module_id integer,
  source_entry_id text,
  target_module_id integer,
  target_entry_id text,
  target_table text,
  relationship text,
  notes text
);

alter table public.knowledge_modules enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.knowledge_cross_refs enable row level security;

revoke all on public.knowledge_modules, public.knowledge_entries,
  public.knowledge_cross_refs from public, anon, authenticated;
grant select, insert, update, delete on public.knowledge_modules,
  public.knowledge_entries, public.knowledge_cross_refs to service_role;
grant usage, select on sequence public.knowledge_modules_id_seq,
  public.knowledge_entries_id_seq, public.knowledge_cross_refs_id_seq
  to service_role;

drop policy if exists service_role_all_knowledge_modules_foundation
  on public.knowledge_modules;
create policy service_role_all_knowledge_modules_foundation
  on public.knowledge_modules
  for all to service_role using (true) with check (true);

drop policy if exists service_role_all_knowledge_entries_foundation
  on public.knowledge_entries;
create policy service_role_all_knowledge_entries_foundation
  on public.knowledge_entries
  for all to service_role using (true) with check (true);

drop policy if exists service_role_all_knowledge_cross_refs_foundation
  on public.knowledge_cross_refs;
create policy service_role_all_knowledge_cross_refs_foundation
  on public.knowledge_cross_refs
  for all to service_role using (true) with check (true);

comment on table public.knowledge_modules is
  'Service-only Knowledge Backbone module registry reconstructed for executable migration replay.';
comment on table public.knowledge_entries is
  'Service-only Knowledge Backbone entry substrate reconstructed for executable migration replay; no corpus rows are invented.';
comment on table public.knowledge_cross_refs is
  'Service-only Knowledge Backbone cross-reference substrate reconstructed for executable migration replay.';
