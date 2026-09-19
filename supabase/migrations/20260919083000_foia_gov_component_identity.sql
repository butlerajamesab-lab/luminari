alter table public.foia_agencies
  add column if not exists source_external_id text;

create unique index if not exists idx_foia_agencies_source_external_id
  on public.foia_agencies(source_external_id)
  where source_external_id is not null;

comment on column public.foia_agencies.source_external_id is
  'Stable upstream component identifier, e.g. FOIA.gov agency component UUID. Used for deterministic merge/upsert without replacing existing row identity.';
