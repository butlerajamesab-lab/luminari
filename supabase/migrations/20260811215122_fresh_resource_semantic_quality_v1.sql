create or replace function public.create_luminari_resource_semantic_quality_v1(
  p_run_id uuid,
  p_source_quality_version text,
  p_target_quality_version text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_publishable integer:=0;
  v_review integer:=0;
  v_quarantined integer:=0;
  v_identity jsonb;
begin
  insert into public.luminari_corpus_resource_quality_v1(
    run_id,quality_version,candidate_key,artifact_key,artifact_role,source_locator,effective_name,normalized_name_key,
    state_code,jurisdiction,category,organization_name,phone,email,website_url,website_domain,phone_key,source_record_id,
    source_priority,quality_state,quality_reasons,evaluated_at
  )
  select
    q.run_id,p_target_quality_version,q.candidate_key,q.artifact_key,q.artifact_role,q.source_locator,q.effective_name,
    q.normalized_name_key,q.state_code,q.jurisdiction,q.category,q.organization_name,q.phone,q.email,q.website_url,
    q.website_domain,q.phone_key,q.source_record_id,q.source_priority,
    case
      when q.quality_state='quarantined' then 'quarantined'
      when q.effective_name ~* '^\s*(critical\s+note|program\s+notes?|important\s+note|note)\s*:' then 'quarantined'
      else q.quality_state end,
    q.quality_reasons || case
      when q.effective_name ~* '^\s*(critical\s+note|program\s+notes?|important\s+note|note)\s*:'
      then '["semantic_note_not_resource"]'::jsonb else '[]'::jsonb end,
    now()
  from public.luminari_corpus_resource_quality_v1 q
  where q.run_id=p_run_id and q.quality_version=p_source_quality_version
  on conflict(run_id,quality_version,candidate_key) do update set
    quality_state=excluded.quality_state,quality_reasons=excluded.quality_reasons,evaluated_at=now();

  v_identity:=public.rebuild_luminari_corpus_resource_identities_v1(p_run_id,p_target_quality_version);

  select count(*) filter(where quality_state='publishable_candidate')::int,
         count(*) filter(where quality_state='review_hold')::int,
         count(*) filter(where quality_state='quarantined')::int
  into v_publishable,v_review,v_quarantined
  from public.luminari_corpus_resource_quality_v1
  where run_id=p_run_id and quality_version=p_target_quality_version;

  return jsonb_build_object(
    'run_id',p_run_id,'source_quality_version',p_source_quality_version,'quality_version',p_target_quality_version,
    'publishable_candidates',v_publishable,'review_hold',v_review,'quarantined',v_quarantined,
    'identity_result',v_identity,'evaluated_at',clock_timestamp()
  );
end;
$$;
revoke all on function public.create_luminari_resource_semantic_quality_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_luminari_resource_semantic_quality_v1(uuid,text,text) to service_role;
