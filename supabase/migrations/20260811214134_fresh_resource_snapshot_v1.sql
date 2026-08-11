create or replace function public.refresh_luminari_state_enrichment_quality_v1(
  p_run_id uuid,
  p_quality_version text default 'resource_quality_state_enrichment_v1.0.0'
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_total integer:=0;
  v_publishable integer:=0;
  v_review integer:=0;
  v_quarantined integer:=0;
begin
  insert into public.luminari_corpus_resource_quality_v1(
    run_id,quality_version,candidate_key,artifact_key,artifact_role,source_locator,effective_name,normalized_name_key,
    state_code,jurisdiction,category,organization_name,phone,email,website_url,website_domain,phone_key,source_record_id,
    source_priority,quality_state,quality_reasons,evaluated_at
  )
  select
    c.run_id,p_quality_version,c.candidate_key,c.artifact_key,a.artifact_role,c.source_locator,
    public.luminari_clean_resource_name_v1(c.name),
    nullif(lower(regexp_replace(coalesce(public.luminari_clean_resource_name_v1(c.name),''),'[^a-z0-9]+','','g')),''),
    c.state_code,coalesce(c.jurisdiction,c.state_code),c.category,
    case when c.organization_name is null or public.luminari_resource_name_invalid_v1(c.organization_name) then null else c.organization_name end,
    case when length(regexp_replace(coalesce(c.phone,''),'\D','','g'))>=10 or coalesce(c.phone,'') ~* '(^|[^0-9])211([^0-9]|$)' then c.phone else null end,
    c.email,
    case when coalesce(c.website_url,'') ~* '(https?://|www\.|[a-z0-9-]+\.[a-z]{2,})' then c.website_url else null end,
    case when coalesce(c.website_url,'') ~* '(https?://|www\.|[a-z0-9-]+\.[a-z]{2,})'
      then nullif(lower(regexp_replace(coalesce(substring(c.website_url from '(?i)(?:https?://)?(?:www\.)?([^/\s]+)'),''),'^www\.','','i')),'') else null end,
    case when length(regexp_replace(coalesce(c.phone,''),'\D','','g'))>=10 then right(regexp_replace(c.phone,'\D','','g'),10) else null end,
    null,
    80,
    case
      when public.luminari_resource_name_invalid_v1(c.name) then 'quarantined'
      when coalesce(c.jurisdiction,c.state_code) is null then 'review_hold'
      when c.jurisdiction_resolution_state='conflict' then 'quarantined'
      else 'publishable_candidate' end,
    to_jsonb(array_remove(array[
      'source_attached_not_independently_reverified',
      case when public.luminari_resource_name_invalid_v1(c.name) then 'invalid_resource_name' end,
      case when coalesce(c.jurisdiction,c.state_code) is null then 'jurisdiction_unresolved' end,
      case when c.jurisdiction_resolution_state='conflict' then 'jurisdiction_conflict' end,
      case when c.organization_name is not null and public.luminari_resource_name_invalid_v1(c.organization_name) then 'discarded_invalid_organization_field' end,
      case when c.phone is not null and length(regexp_replace(c.phone,'\D','','g'))<10 and c.phone !~* '(^|[^0-9])211([^0-9]|$)' then 'discarded_nonphone_value' end,
      case when c.website_url is not null and c.website_url !~* '(https?://|www\.|[a-z0-9-]+\.[a-z]{2,})' then 'discarded_nonwebsite_value' end
    ]::text[],null)),now()
  from public.luminari_corpus_candidate_v1 c
  join public.luminari_corpus_source_artifact_v1 a on a.artifact_key=c.artifact_key
  where c.run_id=p_run_id
    and c.candidate_type='resource'
    and a.artifact_role='state_enrichment_source'
    and c.payload->>'parser_rule'='state_enrichment_label_value_block'
  on conflict(run_id,quality_version,candidate_key) do update set
    effective_name=excluded.effective_name,normalized_name_key=excluded.normalized_name_key,state_code=excluded.state_code,
    jurisdiction=excluded.jurisdiction,category=excluded.category,organization_name=excluded.organization_name,phone=excluded.phone,
    email=excluded.email,website_url=excluded.website_url,website_domain=excluded.website_domain,phone_key=excluded.phone_key,
    source_priority=excluded.source_priority,quality_state=excluded.quality_state,quality_reasons=excluded.quality_reasons,evaluated_at=now();

  select count(*)::int,
    count(*) filter(where quality_state='publishable_candidate')::int,
    count(*) filter(where quality_state='review_hold')::int,
    count(*) filter(where quality_state='quarantined')::int
  into v_total,v_publishable,v_review,v_quarantined
  from public.luminari_corpus_resource_quality_v1
  where run_id=p_run_id and quality_version=p_quality_version;

  return jsonb_build_object('run_id',p_run_id,'quality_version',p_quality_version,'resource_candidates',v_total,
    'publishable_candidates',v_publishable,'review_hold',v_review,'quarantined',v_quarantined,'evaluated_at',clock_timestamp());
end;
$$;
revoke all on function public.refresh_luminari_state_enrichment_quality_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.refresh_luminari_state_enrichment_quality_v1(uuid,text) to service_role;

create table if not exists public.luminari_resource_snapshot_v1(
  snapshot_id uuid primary key default gen_random_uuid(),
  snapshot_version text not null,
  source_quality_lanes jsonb not null,
  status text not null default 'sealed',
  is_current boolean not null default false,
  resource_count integer not null default 0,
  conflict_count integer not null default 0,
  receipt_hash text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check(receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$')
);
comment on table public.luminari_resource_snapshot_v1 is 'Sealed cross-run resource snapshot. Activation is explicit and never rewrites source candidates or historical snapshots.';

create table if not exists public.luminari_resource_snapshot_identity_v1(
  snapshot_id uuid not null references public.luminari_resource_snapshot_v1(snapshot_id) on delete restrict,
  resource_entity_id uuid not null,
  identity_key text not null,
  resolution_state text not null,
  canonical_name text not null,
  normalized_name_key text not null,
  state_code text,
  jurisdiction text not null,
  category text,
  canonical_candidate_key text not null references public.luminari_corpus_candidate_v1(candidate_key),
  organization_name text,
  phone text,
  email text,
  website_url text,
  address text,
  description text,
  eligibility_summary text,
  apply_notes text,
  verification_state text not null default 'source_attached',
  candidate_count integer not null,
  candidate_keys jsonb not null,
  source_artifacts jsonb not null,
  observed_domains jsonb not null,
  observed_phones jsonb not null,
  quality_lanes jsonb not null,
  provenance jsonb not null,
  identity_receipt_hash text not null,
  created_at timestamptz not null default now(),
  primary key(snapshot_id,resource_entity_id),
  unique(snapshot_id,identity_key),
  check(identity_receipt_hash ~ '^[0-9a-f]{64}$')
);
comment on table public.luminari_resource_snapshot_identity_v1 is 'Resolved and conflicted resource identities in a sealed fresh-corpus snapshot. Public reads may expose resolved rows only after explicit snapshot activation.';

create index if not exists luminari_resource_snapshot_current_idx on public.luminari_resource_snapshot_v1(is_current,created_at desc);
create index if not exists luminari_resource_snapshot_identity_lookup_idx on public.luminari_resource_snapshot_identity_v1(snapshot_id,resolution_state,state_code,category,canonical_name);
revoke all on public.luminari_resource_snapshot_v1 from anon,authenticated;
revoke all on public.luminari_resource_snapshot_identity_v1 from anon,authenticated;

create or replace function public.luminari_resource_identity_uuid_v1(p_identity_key text)
returns uuid
language sql
immutable
as $$
  select (substr(p_identity_key,1,8)||'-'||substr(p_identity_key,9,4)||'-'||substr(p_identity_key,13,4)||'-'||substr(p_identity_key,17,4)||'-'||substr(p_identity_key,21,12))::uuid
$$;

create or replace function public.create_luminari_resource_snapshot_v1(
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

  insert into public.luminari_resource_snapshot_v1(snapshot_version,source_quality_lanes,status,is_current)
  values(p_snapshot_version,p_quality_lanes,'building',false)
  returning snapshot_id into v_snapshot_id;

  insert into public.luminari_resource_snapshot_identity_v1(
    snapshot_id,resource_entity_id,identity_key,resolution_state,canonical_name,normalized_name_key,state_code,jurisdiction,category,
    canonical_candidate_key,organization_name,phone,email,website_url,address,description,eligibility_summary,apply_notes,
    verification_state,candidate_count,candidate_keys,source_artifacts,observed_domains,observed_phones,quality_lanes,provenance,identity_receipt_hash
  )
  with lanes as (
    select x.run_id::uuid as run_id,x.quality_version,x.lane_priority
    from jsonb_to_recordset(p_quality_lanes) as x(run_id text,quality_version text,lane_priority integer)
  ), q as (
    select q.*,coalesce(l.lane_priority,0) as lane_priority,
      row_number() over(
        partition by q.jurisdiction,q.normalized_name_key
        order by coalesce(l.lane_priority,0) desc,q.source_priority desc,
          (q.source_record_id is not null) desc,(q.website_domain is not null) desc,(q.phone_key is not null) desc,
          q.artifact_key,q.candidate_key
      ) as choice_rank
    from public.luminari_corpus_resource_quality_v1 q
    join lanes l on l.run_id=q.run_id and l.quality_version=q.quality_version
    where q.quality_state='publishable_candidate'
      and q.jurisdiction is not null
      and q.normalized_name_key is not null
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
      jsonb_agg(distinct jsonb_build_object('run_id',run_id,'quality_version',quality_version,'source_priority',source_priority,'lane_priority',lane_priority)) as quality_lanes
    from q group by jurisdiction,normalized_name_key
  ), resolved as (
    select g.*,
      case when
        (g.distinct_domains>1 and g.domain_observations=g.distinct_domains and not(g.phone_observations>g.distinct_phones))
        or (g.distinct_phones>1 and g.phone_observations=g.distinct_phones and not(g.domain_observations>g.distinct_domains))
      then 'unresolved_conflict' else 'resolved' end as resolution_state
    from grouped g
  ), chosen as (
    select q.*,r.candidate_count,r.candidate_keys,r.source_artifacts,r.observed_domains,r.observed_phones,r.quality_lanes,r.resolution_state,
      encode(digest(q.jurisdiction||'|'||q.normalized_name_key,'sha256'),'hex') as identity_key
    from q join resolved r using(jurisdiction,normalized_name_key)
    where q.choice_rank=1
  )
  select
    v_snapshot_id,
    public.luminari_resource_identity_uuid_v1(ch.identity_key),
    ch.identity_key,ch.resolution_state,ch.effective_name,ch.normalized_name_key,ch.state_code,ch.jurisdiction,ch.category,
    ch.candidate_key,ch.organization_name,ch.phone,ch.email,ch.website_url,c.address,c.description,c.eligibility_summary,c.apply_notes,
    'source_attached',ch.candidate_count,ch.candidate_keys,ch.source_artifacts,ch.observed_domains,ch.observed_phones,ch.quality_lanes,
    jsonb_build_object(
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

  select count(*) filter(where resolution_state='resolved')::int,
         count(*) filter(where resolution_state<>'resolved')::int
  into v_resource_count,v_conflict_count
  from public.luminari_resource_snapshot_identity_v1
  where snapshot_id=v_snapshot_id;

  select encode(digest(
    p_snapshot_version||'|'||p_quality_lanes::text||'|'||coalesce(string_agg(identity_receipt_hash,'|' order by identity_key),''),
    'sha256'),'hex')
  into v_receipt_hash
  from public.luminari_resource_snapshot_identity_v1
  where snapshot_id=v_snapshot_id;

  update public.luminari_resource_snapshot_v1
  set status='sealed',resource_count=v_resource_count,conflict_count=v_conflict_count,receipt_hash=v_receipt_hash,
      metadata=jsonb_build_object('resolved_resources',v_resource_count,'identity_conflicts',v_conflict_count,'publication_mutated',false)
  where snapshot_id=v_snapshot_id;

  return jsonb_build_object('snapshot_id',v_snapshot_id,'snapshot_version',p_snapshot_version,'status','sealed',
    'resolved_resources',v_resource_count,'identity_conflicts',v_conflict_count,'receipt_hash',v_receipt_hash,'activated',false);
end;
$$;
revoke all on function public.create_luminari_resource_snapshot_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_luminari_resource_snapshot_v1(text,jsonb) to service_role;

create or replace function public.activate_luminari_resource_snapshot_v1(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_snapshot record;
begin
  select * into v_snapshot from public.luminari_resource_snapshot_v1 where snapshot_id=p_snapshot_id for update;
  if not found then raise exception 'resource_snapshot_not_found'; end if;
  if v_snapshot.status<>'sealed' then raise exception 'resource_snapshot_not_sealed'; end if;
  if coalesce(v_snapshot.resource_count,0)<=0 then raise exception 'resource_snapshot_empty'; end if;
  update public.luminari_resource_snapshot_v1 set is_current=false where is_current=true and snapshot_id<>p_snapshot_id;
  update public.luminari_resource_snapshot_v1 set is_current=true,status='active',activated_at=now() where snapshot_id=p_snapshot_id;
  return jsonb_build_object('snapshot_id',p_snapshot_id,'status','active','resource_count',v_snapshot.resource_count,'conflict_count',v_snapshot.conflict_count,'receipt_hash',v_snapshot.receipt_hash,'activated_at',clock_timestamp());
end;
$$;
revoke all on function public.activate_luminari_resource_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function public.activate_luminari_resource_snapshot_v1(uuid) to service_role;
