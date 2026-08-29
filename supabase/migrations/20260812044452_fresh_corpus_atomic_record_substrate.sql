create table if not exists public.luminari_corpus_atomic_run_v1 (
  run_id uuid primary key default gen_random_uuid(),
  engine_version text not null,
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','completed_with_failures','failed')),
  artifact_count integer not null default 0,
  atomic_record_count integer not null default 0,
  origin_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  receipt_hash text,
  result_json jsonb not null default '{}'::jsonb
);

create table if not exists public.luminari_corpus_atomic_artifact_v1 (
  run_id uuid not null references public.luminari_corpus_atomic_run_v1(run_id) on delete cascade,
  artifact_key text not null references public.luminari_corpus_source_artifact_v1(artifact_key),
  status text not null default 'queued' check (status in ('queued','running','completed','skipped_exact_duplicate','failed')),
  attempt_count integer not null default 0,
  content_sha256 text,
  atomic_record_count integer not null default 0,
  origin_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  receipt_hash text,
  result_json jsonb not null default '{}'::jsonb,
  primary key (run_id,artifact_key)
);

create table if not exists public.luminari_corpus_atomic_record_v1 (
  atomic_record_key text primary key check (atomic_record_key ~ '^[0-9a-f]{64}$'),
  source_file_sha256 text not null check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  source_kind text not null,
  source_relation text,
  row_ordinal integer not null check (row_ordinal >= 0),
  column_names jsonb not null default '[]'::jsonb,
  values_json jsonb not null default '{}'::jsonb,
  raw_excerpt text,
  parser_version text not null,
  record_hash text not null check (record_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists luminari_corpus_atomic_record_source_idx
  on public.luminari_corpus_atomic_record_v1(source_file_sha256,source_kind,source_relation,row_ordinal);
create index if not exists luminari_corpus_atomic_record_relation_idx
  on public.luminari_corpus_atomic_record_v1(source_relation,source_kind);

create table if not exists public.luminari_corpus_atomic_record_origin_v1 (
  atomic_record_key text not null references public.luminari_corpus_atomic_record_v1(atomic_record_key) on delete cascade,
  origin_hash text not null check (origin_hash ~ '^[0-9a-f]{64}$'),
  run_id uuid not null references public.luminari_corpus_atomic_run_v1(run_id) on delete cascade,
  artifact_key text not null references public.luminari_corpus_source_artifact_v1(artifact_key),
  container_member_path text,
  source_locator text not null,
  observed_at timestamptz not null default now(),
  primary key (atomic_record_key,origin_hash)
);

create index if not exists luminari_corpus_atomic_origin_run_idx
  on public.luminari_corpus_atomic_record_origin_v1(run_id,artifact_key);

comment on table public.luminari_corpus_atomic_record_v1 is
  'Fresh source-bound atomic records. A row here is substrate, not a canonical resource, legal conclusion, signal, or finding.';
comment on table public.luminari_corpus_atomic_record_origin_v1 is
  'Append-only provenance origins for deduplicated atomic records, including archive member paths.';

revoke all on public.luminari_corpus_atomic_run_v1 from public,anon,authenticated;
revoke all on public.luminari_corpus_atomic_artifact_v1 from public,anon,authenticated;
revoke all on public.luminari_corpus_atomic_record_v1 from public,anon,authenticated;
revoke all on public.luminari_corpus_atomic_record_origin_v1 from public,anon,authenticated;
