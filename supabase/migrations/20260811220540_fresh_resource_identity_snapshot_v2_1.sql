create or replace function public.create_luminari_resource_snapshot_v2_1(
  p_snapshot_version text,
  p_quality_lanes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_resource_count integer:=0;
  v_conflict_count integer:=0;
  v_receipt_hash text;
begin
  if jsonb_typeof(p_quality_lanes)<>'array' or jsonb_array_length(p_quality_lanes)=0 then
    raise exception 'resource_snapshot_quality_lanes_required';
  end if;

  insert into public.luminari_resource_snapshot_v1(snapshot_version,source_quality_lanes,status,is_current,metadata)
  values(p_snapshot_version,p_quality_lanes,'building',false,jsonb_build_object('identity_engine','fresh_resource_identity_v2_1'))
  returning snapshot_id into v_snapshot_id;

  insert into public.luminari_resource_snapshot_identity_v1(
    snapshot_id,resource_entity_id,identity_key,resolution_state,canonical_name,normalized_name_key,state_code,jurisdiction,category,
    canonical_candidate_key,organization_name,phone,email,website_url,address,description,eligibility_summary,apply_notes,
    verification_state,candidate_count,candidate_keys,source_artifacts,observed_domains,observed_phones,quality_lanes,provenance,identity_receipt_hash
  )
  with lanes as (
    select x.run_id::uuid as run_id,x.quality_version,x.lane_priority
    from jsonb_to_recordset(p_quality_lanes) as x(run_id text,quality_version text,lane_priority integer)
  ), q0 as (
    select q.*,coalesce(l.lane_priority,0) as lane_priority,
      nullif(regexp_replace(lower(regexp_replace(coalesce(q.effective_name,''),'\([^)]*\)',' ','g')),'[^a-z0-9]+','','g'),'') as base_name_key
    from public.luminari_corpus_resource_quality_v1 q
    join lanes l on l.run_id=q.run_id and l.quality_version=q.quality_version
    where q.quality_state='publishable_candidate'
      and q.jurisdiction is not null
      and q.normalized_name_key is not null
  ), exact_stats as (
    select jurisdiction,normalized_name_key,
      count(distinct website_domain) filter(where website_domain is not null)::int as exact_distinct_domains,
      count(distinct phone_key) filter(where phone_key is not null)::int as exact_distinct_phones,
      min(website_domain) filter(where website_domain is not null) as exact_only_domain,
      min(phone_key) filter(where phone_key is not null) as exact_only_phone
    from q0
    group by jurisdiction,normalized_name_key
  ), base_stats as (
    select jurisdiction,base_name_key,
      count(distinct website_domain) filter(where website_domain is not null)::int as base_distinct_domains,
      count(distinct phone_key) filter(where phone_key is not null)::int as base_distinct_phones,
      min(website_domain) filter(where website_domain is not null) as base_only_domain,
      min(phone_key) filter(where phone_key is not null) as base_only_phone
    from q0
    where base_name_key is not null
    group by jurisdiction,base_name_key
  ), q1 as (
    select q0.*,
      coalesce(es.exact_distinct_domains,0) as exact_distinct_domains,
      coalesce(es.exact_distinct_phones,0) as exact_distinct_phones,
      case
        when coalesce(es.exact_distinct_domains,0)>1
          or (coalesce(es.exact_distinct_domains,0)=0 and coalesce(es.exact_distinct_phones,0)>1)
        then true else false end as exact_strong_conflict,
      case
        when q0.website_domain is not null then 'domain:'||q0.base_name_key||':'||q0.website_domain
        when coalesce(es.exact_distinct_domains,0)=1 then 'domain:'||q0.base_name_key||':'||es.exact_only_domain
        when q0.phone_key is not null then 'phone:'||q0.base_name_key||':'||q0.phone_key
        when coalesce(es.exact_distinct_domains,0)=0 and coalesce(es.exact_distinct_phones,0)=1 then 'phone:'||q0.base_name_key||':'||es.exact_only_phone
        when coalesce(bs.base_distinct_domains,0)=1 then 'domain:'||q0.base_name_key||':'||bs.base_only_domain
        when coalesce(bs.base_distinct_domains,0)=0 and coalesce(bs.base_distinct_phones,0)=1 then 'phone:'||q0.base_name_key||':'||bs.base_only_phone
        else 'name:'||q0.normalized_name_key
      end as identity_group_key
    from q0
    left join exact_stats es using(jurisdiction,normalized_name_key)
    left join base_stats bs using(jurisdiction,base_name_key)
  ), ranked as (
    select q1.*,
      row_number() over(
        partition by jurisdiction,identity_group_key
        order by lane_priority desc,source_priority desc,(source_record_id is not null) desc,
          (website_domain is not null) desc,(phone_key is not null) desc,artifact_key,candidate_key
      ) as choice_rank
    from q1
  ), grouped as (
    select jurisdiction,identity_group_key,
      count(*)::int as candidate_count,
      count(distinct website_domain) filter(where website_domain is not null)::int as distinct_domains,
      count(distinct phone_key) filter(where phone_key is not null)::int as distinct_phones,
      bool_or(exact_strong_conflict) as exact_strong_conflict,
      jsonb_agg(candidate_key order by candidate_key) as candidate_keys,
      jsonb_agg(distinct artifact_key) as source_artifacts,
      coalesce(jsonb_agg(distinct website_domain) filter(where website_domain is not null),'[]'::jsonb) as observed_domains,
      coalesce(jsonb_agg(distinct phone_key) filter(where phone_key is not null),'[]'::jsonb) as observed_phones,
      jsonb_agg(distinct jsonb_build_object('run_id',run_id,'quality_version',quality_version,'source_priority',source_priority,'lane_priority',lane_priority)) as quality_lanes
    from ranked
    group by jurisdiction,identity_group_key
  ), resolved as (
    select g.*,
      case
        when exact_strong_conflict then 'unresolved_conflict'
        when identity_group_key like 'domain:%' then 'resolved'
        when identity_group_key like 'phone:%' and distinct_domains>1 then 'unresolved_conflict'
        when identity_group_key like 'name:%' and (distinct_domains>1 or distinct_phones>1) then 'unresolved_conflict'
        else 'resolved'
      end as resolution_state
    from grouped g
  ), chosen as (
    select r.*,g.candidate_count,g.candidate_keys,g.source_artifacts,g.observed_domains,g.observed_phones,g.quality_lanes,g.resolution_state,
      encode(digest(r.jurisdiction||'|'||r.identity_group_key,'sha256'),'hex') as identity_key
    from ranked r
    join resolved g using(jurisdiction,identity_group_key)
    where r.choice_rank=1
  )
  select v_snapshot_id,public.luminari_resource_identity_uuid_v1(ch.identity_key),ch.identity_key,ch.resolution_state,
    ch.effective_name,ch.normalized_name_key,ch.state_code,ch.jurisdiction,ch.category,ch.candidate_key,
    ch.organization_name,ch.phone,ch.email,ch.website_url,c.address,c.description,c.eligibility_summary,c.apply_notes,
    'source_attached',ch.candidate_count,ch.candidate_keys,ch.source_artifacts,ch.observed_domains,ch.observed_phones,ch.quality_lanes,
    jsonb_build_object(
      'identity_engine','fresh_resource_identity_v2_1',
      'identity_group_key',ch.identity_group_key,
      'base_name_key',ch.base_name_key,
      'exact_strong_conflict',ch.exact_strong_conflict,
      'exact_distinct_domains',ch.exact_distinct_domains,
      'exact_distinct_phones',ch.exact_distinct_phones,
      'canonical_candidate_key',ch.candidate_key,
      'canonical_artifact_key',ch.artifact_key,
      'source_locator',ch.source_locator,
      'quality_reasons',ch.quality_reasons,
      'candidate_state',c.candidate_state,
      'parser_version',c.parser_version,
      'source_content_sha256',c.source_content_sha256,
      'jurisdiction_resolution_state',c.jurisdiction_resolution_state
    ),
    encode(digest(ch.identity_key||'|'||ch.resolution_state||'|'||ch.candidate_keys::text||'|'||ch.source_artifacts::text||'|'||ch.quality_lanes::text,'sha256'),'hex')
  from chosen ch
  join public.luminari_corpus_candidate_v1 c on c.candidate_key=ch.candidate_key;

  select count(*) filter(where resolution_state='resolved')::int,count(*) filter(where resolution_state<>'resolved')::int
  into v_resource_count,v_conflict_count
  from public.luminari_resource_snapshot_identity_v1 where snapshot_id=v_snapshot_id;

  select encode(digest(p_snapshot_version||'|'||p_quality_lanes::text||'|'||coalesce(string_agg(identity_receipt_hash,'|' order by identity_key),''),'sha256'),'hex')
  into v_receipt_hash
  from public.luminari_resource_snapshot_identity_v1 where snapshot_id=v_snapshot_id;

  update public.luminari_resource_snapshot_v1
  set status='sealed',resource_count=v_resource_count,conflict_count=v_conflict_count,receipt_hash=v_receipt_hash,
      metadata=metadata||jsonb_build_object('resolved_resources',v_resource_count,'identity_conflicts',v_conflict_count,'publication_mutated',false)
  where snapshot_id=v_snapshot_id;

  return jsonb_build_object('snapshot_id',v_snapshot_id,'snapshot_version',p_snapshot_version,'status','sealed',
    'identity_engine','fresh_resource_identity_v2_1','resolved_resources',v_resource_count,'identity_conflicts',v_conflict_count,
    'receipt_hash',v_receipt_hash,'activated',false);
end;
$$;
revoke all on function public.create_luminari_resource_snapshot_v2_1(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_luminari_resource_snapshot_v2_1(text,jsonb) to service_role;
