begin;

-- These operational and corpus tables are intentionally service-only. Their
-- existing ACLs already exclude anon/authenticated; RLS adds defense in depth
-- without changing postgres/service_role access. Do not FORCE RLS because the
-- application and managed workers use privileged server-side connections.
alter table public.atlas_stream_runtime_projection_v1 enable row level security;
alter table public.civic_genome_rosetta_generation_upgrade_queue enable row level security;
alter table public.live_data_signal_semantic_transition_v1 enable row level security;
alter table public.luminari_corpus_atomic_artifact_v1 enable row level security;
alter table public.luminari_corpus_atomic_record_origin_v1 enable row level security;
alter table public.luminari_corpus_atomic_record_v1 enable row level security;
alter table public.luminari_corpus_atomic_run_v1 enable row level security;
alter table public.luminari_corpus_candidate_v1 enable row level security;
alter table public.luminari_corpus_identity_evidence_v1 enable row level security;
alter table public.luminari_corpus_identity_v1 enable row level security;
alter table public.luminari_corpus_rebuild_artifact_v1 enable row level security;
alter table public.luminari_corpus_rebuild_run_v1 enable row level security;
alter table public.luminari_corpus_resource_identity_v1 enable row level security;
alter table public.luminari_corpus_resource_quality_v1 enable row level security;
alter table public.luminari_corpus_source_artifact_v1 enable row level security;
alter table public.luminari_resource_snapshot_identity_v1 enable row level security;
alter table public.luminari_resource_snapshot_v1 enable row level security;

-- FOIA requests contain requester contact information and generated letter
-- content. All application access is through protected server-side routes, so
-- remove the blanket authenticated Data API read path and all browser grants.
alter table public.foia_requests enable row level security;

drop policy if exists authenticated_all_access_foia_requests
  on public.foia_requests;

revoke all privileges on table public.foia_requests
  from public, anon, authenticated;
revoke all privileges on sequence public.foia_requests_id_seq
  from public, anon, authenticated;

commit;
