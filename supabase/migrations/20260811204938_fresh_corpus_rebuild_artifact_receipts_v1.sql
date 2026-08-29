create table if not exists public.luminari_corpus_rebuild_artifact_v1 (
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  artifact_key text not null references public.luminari_corpus_source_artifact_v1(artifact_key),
  status text not null default 'pending',
  attempt_count integer not null default 0,
  content_sha256 text,
  extracted_text_sha256 text,
  candidate_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  receipt_hash text,
  result_json jsonb not null default '{}'::jsonb,
  primary key(run_id,artifact_key),
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  check (extracted_text_sha256 is null or extracted_text_sha256 ~ '^[0-9a-f]{64}$'),
  check (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$')
);
comment on table public.luminari_corpus_rebuild_artifact_v1 is 'Per-run deterministic artifact receipts for fresh corpus reconciliation. Allows bounded resume without treating global source state as run state.';
create index if not exists luminari_corpus_rebuild_artifact_status_idx on public.luminari_corpus_rebuild_artifact_v1(run_id,status,artifact_key);
revoke all on public.luminari_corpus_rebuild_artifact_v1 from anon,authenticated;
