create or replace function public.rebuild_luminari_corpus_resource_identities_v1(
  p_run_id uuid,
  p_quality_version text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_resolved integer := 0;
  v_conflicts integer := 0;
begin
  delete from public.luminari_corpus_resource_identity_v1 where run_id=p_run_id and quality_version=p_quality_version;

  insert into public.luminari_corpus_resource_identity_v1(
    run_id,quality_version,identity_key,resolution_state,canonical_name,normalized_name_key,state_code,jurisdiction,category,
    canonical_candidate_key,organization_name,phone,email,website_url,candidate_count,candidate_keys,source_artifacts,
    observed_domains,observed_phones,source_record_ids,identity_receipt_hash
  )
  with q as (
    select q.*,
      row_number() over(
        partition by q.jurisdiction,q.normalized_name_key
        order by q.source_priority desc,(q.source_record_id is not null) desc,(q.website_domain is not null) desc,
                 (q.phone_key is not null) desc,q.artifact_key,q.candidate_key
      ) as choice_rank
    from public.luminari_corpus_resource_quality_v1 q
    where q.run_id=p_run_id and q.quality_version=p_quality_version and q.quality_state='publishable_candidate'
      and q.normalized_name_key is not null and q.jurisdiction is not null
  ), grouped as (
    select jurisdiction,normalized_name_key,
      count(*)::int as candidate_count,
      count(website_domain)::int as domain_observations,
      count(distinct website_domain)::int as distinct_domains,
      count(phone_key)::int as phone_observations,
      count(distinct phone_key)::int as distinct_phones,
      jsonb_agg(candidate_key order by candidate_key) as candidate_keys,
      jsonb_agg(distinct artifact_key) as source_artifacts,
      coalesce(jsonb_agg(distinct website_domain) filter(where website_domain is not null),'[]'::jsonb) as observed_domains,
      coalesce(jsonb_agg(distinct phone_key) filter(where phone_key is not null),'[]'::jsonb) as observed_phones,
      coalesce(jsonb_agg(distinct source_record_id) filter(where source_record_id is not null),'[]'::jsonb) as source_record_ids
    from q group by jurisdiction,normalized_name_key
  ), resolved as (
    select g.*,
      case when
        (g.distinct_domains>1 and g.domain_observations=g.distinct_domains and not(g.phone_observations>g.distinct_phones))
        or (g.distinct_phones>1 and g.phone_observations=g.distinct_phones and not(g.domain_observations>g.distinct_domains))
      then 'unresolved_conflict' else 'resolved' end as resolution_state
    from grouped g
  ), chosen as (
    select q.*,r.candidate_count,r.candidate_keys,r.source_artifacts,r.observed_domains,r.observed_phones,r.source_record_ids,r.resolution_state
    from q join resolved r using(jurisdiction,normalized_name_key)
    where q.choice_rank=1
  )
  select p_run_id,p_quality_version,
    encode(digest(ch.jurisdiction||'|'||ch.normalized_name_key||'|'||ch.resolution_state,'sha256'),'hex'),
    ch.resolution_state,ch.effective_name,ch.normalized_name_key,ch.state_code,ch.jurisdiction,ch.category,ch.candidate_key,
    ch.organization_name,ch.phone,ch.email,ch.website_url,ch.candidate_count,ch.candidate_keys,ch.source_artifacts,
    ch.observed_domains,ch.observed_phones,ch.source_record_ids,
    encode(digest(ch.jurisdiction||'|'||ch.normalized_name_key||'|'||ch.resolution_state||'|'||ch.candidate_keys::text||'|'||ch.source_artifacts::text,'sha256'),'hex')
  from chosen ch;

  select count(*) filter(where resolution_state='resolved')::int,
         count(*) filter(where resolution_state<>'resolved')::int
    into v_resolved,v_conflicts
  from public.luminari_corpus_resource_identity_v1
  where run_id=p_run_id and quality_version=p_quality_version;

  return jsonb_build_object(
    'run_id',p_run_id,'quality_version',p_quality_version,
    'resolved_identities',v_resolved,'identity_conflicts',v_conflicts,
    'rebuilt_at',clock_timestamp()
  );
end;
$$;
revoke all on function public.rebuild_luminari_corpus_resource_identities_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.rebuild_luminari_corpus_resource_identities_v1(uuid,text) to service_role;
