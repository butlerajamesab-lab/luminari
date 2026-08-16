create index if not exists luminari_corpus_candidate_hash_artifact_created_idx
  on public.luminari_corpus_candidate_v1 (candidate_hash, artifact_key, created_at desc);

create index if not exists luminari_civic_object_reconciliation_run_hash_reconciled_idx
  on public.luminari_civic_object_reconciliation_v1 (run_id, source_candidate_hash, reconciled_at desc, object_ref);
