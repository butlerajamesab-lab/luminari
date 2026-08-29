-- The queue existed in production before its worker-control migrations were
-- tracked. Restore the pre-worker contract so a zero-based replay can build
-- the real lease and transition functions without fabricating queue data.
create table if not exists public.corpus_import_queue (
  id bigserial primary key,
  source_name text not null,
  source_type text not null,
  source_ext text,
  storage_bucket text,
  storage_path text,
  byte_size bigint,
  sha256 text,
  content_type text,
  storage_mode text,
  target_hint text,
  record_count_estimate integer,
  payload jsonb,
  raw_text text,
  base64_payload text,
  pipeline_context text[],
  domain_tags text[],
  target_surfaces text[],
  import_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_corpus_import_queue_payload
  on public.corpus_import_queue using gin (payload);
create index if not exists idx_corpus_import_queue_sha256
  on public.corpus_import_queue (sha256)
  where sha256 is not null;
create index if not exists idx_corpus_import_queue_status
  on public.corpus_import_queue (import_status);
create index if not exists idx_corpus_import_queue_storage
  on public.corpus_import_queue (storage_bucket, storage_path);
create index if not exists idx_corpus_import_queue_target_hint
  on public.corpus_import_queue (target_hint);

alter table public.corpus_import_queue enable row level security;

revoke all on table public.corpus_import_queue from anon, authenticated;
grant select on table public.corpus_import_queue to authenticated;
grant all on table public.corpus_import_queue to service_role;
revoke all on sequence public.corpus_import_queue_id_seq from public;
grant usage, select on sequence public.corpus_import_queue_id_seq to service_role;

do $policies$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'corpus_import_queue'
      and policyname = 'auth_read_corpus_import_queue'
  ) then
    create policy auth_read_corpus_import_queue
      on public.corpus_import_queue
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'corpus_import_queue'
      and policyname = 'service_all_corpus_import_queue'
  ) then
    create policy service_all_corpus_import_queue
      on public.corpus_import_queue
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$policies$;
