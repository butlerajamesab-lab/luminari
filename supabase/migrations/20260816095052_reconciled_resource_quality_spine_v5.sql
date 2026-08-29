create or replace function public.refresh_luminari_corpus_resource_quality_reconciled_v1(
  p_run_id uuid,
  p_quality_version text default 'resource_quality_reconciled_v5.0.0'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_candidates integer := 0;
  v_publishable integer := 0;
  v_review_hold integer := 0;
  v_quarantined integer := 0;
  v_resolved integer := 0;
  v_conflicts integer := 0;
begin
  if not exists (select 1 from public.luminari_corpus_rebuild_run_v1 where run_id=p_run_id) then
    raise exception 'corpus_run_not_found:%', p_run_id;
  end if;

  delete from public.luminari_corpus_resource_identity_v1
  where run_id=p_run_id and quality_version=p_quality_version;

  delete from public.luminari_corpus_resource_quality_v1
  where run_id=p_run_id and quality_version=p_quality_version;

  insert into public.luminari_corpus_resource_quality_v1(
    run_id,quality_version,candidate_key,artifact_key,artifact_role,source_locator,
    effective_name,normalized_name_key,state_code,jurisdiction,category,organization_name,
    phone,email,website_url,website_domain,phone_key,source_record_id,source_priority,
    quality_state,quality_reasons,evaluated_at
  )
  with base as (
    select
      r.*,
      c.payload,
      public.luminari_clean_resource_name_v1(r.name) as clean_name,
      coalesce(
        nullif(c.payload->'row'->>'resource_uuid',''),
        nullif(c.payload->'row'->>'resource_id',''),
        nullif(c.payload->'row'->>'fed_dir_uuid','')
      ) as source_record_id,
      case
        when r.state_code ~ '^[A-Z]{2}$' then r.state_code
        when upper(coalesce(r.jurisdiction,'')) = any(array[
          'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','AS','MP','VI'
        ]) then upper(r.jurisdiction)
        when upper(coalesce(c.payload->'row'->>'state_code','')) = any(array[
          'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','AS','MP','VI'
        ]) then upper(c.payload->'row'->>'state_code')
        when upper(coalesce(c.payload->'row'->>'coverage_values','')) = any(array[
          'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','AS','MP','VI'
        ]) then upper(c.payload->'row'->>'coverage_values')
        when coalesce(c.payload->'row'->>'jurisdiction_id','') ~ '^[a-z]{2}-' then upper(left(c.payload->'row'->>'jurisdiction_id',2))
        when upper(coalesce(r.jurisdiction,'')) in ('US','FEDERAL','NATIONAL','NATIONWIDE') then 'US'
        when coalesce(c.payload->'row'->>'coverage','') ~* '(national|all 50|federal|nationwide)' then 'US'
        when coalesce(c.payload->'row'->>'jurisdiction','') ~* '^(federal|national|nationwide|us)$' then 'US'
        else null
      end as jurisdiction_key,
      case r.artifact_role
        when 'state_resource_directory_source' then 100
        when 'state_enrichment_source' then 98
        when 'addendum_source' then 96
        when 'structured_workbook_source' then 94
        when 'domain_deep_dive_source' then 92
        else 80
      end as priority
    from public.luminari_civic_object_reconciliation_v1 r
    join public.luminari_corpus_candidate_v1 c on c.candidate_key=r.object_ref
    where r.run_id=p_run_id and r.object_class='resource'
  ), evaluated as (
    select
      b.*,
      nullif(lower(regexp_replace(coalesce(b.clean_name,''),'[^a-z0-9]+','','g')),'') as name_key,
      nullif(lower(regexp_replace(coalesce(substring(b.website_url from '(?i)(?:https?://)?(?:www\.)?([^/\s]+)'),''),'^www\.','','i')),'') as domain_key,
      public.luminari_phone_key_v4(b.phone) as normalized_phone_key,
      case
        when b.jurisdiction_resolution_state='conflict' then 'quarantined'
        when public.luminari_resource_name_invalid_v1(b.clean_name) then 'quarantined'
        when b.jurisdiction_key is null then 'review_hold'
        when not b.has_access_point then 'review_hold'
        else 'publishable_candidate'
      end as qstate
    from base b
  )
  select
    p_run_id,p_quality_version,e.object_ref,e.artifact_key,e.artifact_role,e.source_locator,
    e.clean_name,e.name_key,
    case when e.jurisdiction_key='US' then null else e.jurisdiction_key end,
    e.jurisdiction_key,
    nullif(e.category,''),nullif(e.organization_name,''),nullif(e.phone,''),nullif(e.email,''),
    nullif(e.website_url,''),e.domain_key,e.normalized_phone_key,e.source_record_id,e.priority,e.qstate,
    jsonb_strip_nulls(jsonb_build_array(
      case when e.jurisdiction_resolution_state='conflict' then 'jurisdiction_conflict' end,
      case when public.luminari_resource_name_invalid_v1(e.clean_name) then 'invalid_resource_name' end,
      case when e.jurisdiction_key is null then 'jurisdiction_unresolved' end,
      case when not e.has_access_point then 'access_point_unresolved' end,
      case when e.source_object_type <> 'resource' then 'resource_type_recovered_from_source_semantics' end,
      case when coalesce(e.field_provenance,'{}'::jsonb) <> '{}'::jsonb then 'fields_recovered_from_preserved_source' end
    )),
    now()
  from evaluated e;

  insert into public.luminari_corpus_resource_identity_v1(
    run_id,quality_version,identity_key,resolution_state,canonical_name,normalized_name_key,
    state_code,jurisdiction,category,canonical_candidate_key,organization_name,phone,email,website_url,
    candidate_count,candidate_keys,source_artifacts,observed_domains,observed_phones,source_record_ids,
    identity_receipt_hash
  )
  with q as (
    select q.*,
      row_number() over(
        partition by q.jurisdiction,q.normalized_name_key
        order by q.source_priority desc,
          (q.source_record_id is not null) desc,
          (q.website_domain is not null) desc,
          (q.phone_key is not null) desc,
          q.artifact_key,q.candidate_key
      ) as choice_rank
    from public.luminari_corpus_resource_quality_v1 q
    where q.run_id=p_run_id
      and q.quality_version=p_quality_version
      and q.quality_state='publishable_candidate'
      and q.normalized_name_key is not null
      and q.jurisdiction is not null
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
    from q
    group by jurisdiction,normalized_name_key
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
  select
    p_run_id,p_quality_version,
    encode(digest(ch.jurisdiction||'|'||ch.normalized_name_key||'|'||ch.resolution_state,'sha256'),'hex'),
    ch.resolution_state,ch.effective_name,ch.normalized_name_key,ch.state_code,ch.jurisdiction,ch.category,
    ch.candidate_key,ch.organization_name,ch.phone,ch.email,ch.website_url,ch.candidate_count,
    ch.candidate_keys,ch.source_artifacts,ch.observed_domains,ch.observed_phones,ch.source_record_ids,
    encode(digest(ch.jurisdiction||'|'||ch.normalized_name_key||'|'||ch.resolution_state||'|'||ch.candidate_keys::text||'|'||ch.source_artifacts::text,'sha256'),'hex')
  from chosen ch;

  select count(*)::int,
         count(*) filter(where quality_state='publishable_candidate')::int,
         count(*) filter(where quality_state='review_hold')::int,
         count(*) filter(where quality_state='quarantined')::int
  into v_candidates,v_publishable,v_review_hold,v_quarantined
  from public.luminari_corpus_resource_quality_v1
  where run_id=p_run_id and quality_version=p_quality_version;

  select count(*) filter(where resolution_state='resolved')::int,
         count(*) filter(where resolution_state<>'resolved')::int
  into v_resolved,v_conflicts
  from public.luminari_corpus_resource_identity_v1
  where run_id=p_run_id and quality_version=p_quality_version;

  return jsonb_build_object(
    'run_id',p_run_id,
    'quality_version',p_quality_version,
    'quality_engine','reconciled_resource_quality_v5',
    'resource_candidates',v_candidates,
    'publishable_candidates',v_publishable,
    'review_hold',v_review_hold,
    'quarantined',v_quarantined,
    'resolved_identities',v_resolved,
    'identity_conflicts',v_conflicts,
    'evaluated_at',clock_timestamp()
  );
end;
$$;

revoke all on function public.refresh_luminari_corpus_resource_quality_reconciled_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.refresh_luminari_corpus_resource_quality_reconciled_v1(uuid,text) to service_role;
