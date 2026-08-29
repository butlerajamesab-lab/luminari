create index if not exists luminari_corpus_candidate_run_identity_projection_idx
  on public.luminari_corpus_candidate_v1
  (run_id, candidate_type, state_code, name, candidate_key);
