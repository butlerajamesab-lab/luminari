create index if not exists luminari_corpus_resource_quality_candidate_projection_idx
  on public.luminari_corpus_resource_quality_v1(
    candidate_key,
    run_id,
    quality_version,
    source_priority desc
  );

comment on index public.luminari_corpus_resource_quality_candidate_projection_idx is
  'Supports bounded source-field projection from a sealed snapshot candidate key without scanning every quality lane.';
