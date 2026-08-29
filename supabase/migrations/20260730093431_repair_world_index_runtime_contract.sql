begin;

alter table public.agencies_registry
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.workflow_steps
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.registry_programs
  add column if not exists jurisdiction_id_rp text
  generated always as (jurisdiction_id) stored;

comment on column public.agencies_registry.metadata is
  'Backward-compatible structured metadata contract used by Lighthouse world.getIndex.';

comment on column public.workflow_steps.metadata is
  'Backward-compatible structured metadata contract used by Lighthouse world.getIndex.';

comment on column public.registry_programs.jurisdiction_id_rp is
  'Read-only compatibility projection of jurisdiction_id for the deployed Lighthouse world index query.';

commit;
