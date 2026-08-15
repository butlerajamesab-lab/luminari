-- Bound fresh-corpus identity finalization to one run and its deterministic
-- projection order. Without this index, every automatic seal scanned and
-- sorted the full candidate history after a large workbook replay.
create index if not exists luminari_corpus_candidate_run_identity_projection_idx
  on public.luminari_corpus_candidate_v1
  (run_id, candidate_type, state_code, name, candidate_key);

