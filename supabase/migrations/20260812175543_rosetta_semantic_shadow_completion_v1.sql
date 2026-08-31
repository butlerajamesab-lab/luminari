create table if not exists public.rosetta_semantic_shadow_run (
  extraction_run_id integer not null references public.extraction_run(id),
  parser_version text not null,
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  clause_count integer not null check (clause_count >= 0),
  semantic_receipt_count integer not null check (semantic_receipt_count >= 0),
  validation_pass boolean not null,
  receipt_hash text not null check (receipt_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'complete' check (state = 'complete'),
  completed_at timestamptz not null default now(),
  primary key (extraction_run_id, parser_version)
)

alter table public.rosetta_semantic_shadow_run enable row level security

revoke all on public.rosetta_semantic_shadow_run from public, anon, authenticated

grant select, insert on public.rosetta_semantic_shadow_run to service_role

comment on table public.rosetta_semantic_shadow_run is
  'Atomic completion boundary for noncanonical Rosetta semantic shadow persistence. Consumers must require this row before treating clause IR and semantic receipts as a complete shadow run.'
