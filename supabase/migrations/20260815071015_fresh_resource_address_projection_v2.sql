create or replace function public.luminari_source_address_publishable_v2(p_address text)
returns boolean
language sql
immutable
parallel safe
as $$
  select nullif(trim(coalesce(p_address,'')),'') is not null
    and p_address !~* '<\/?w:|<xml|</xml'
    and trim(p_address) !~* '^(not published|not available|n/?a([^a-z]|$)|none([^a-z]|$)|multiple locations|various locations|statewide|see website|contact )'
    and p_address ~* '(P\.?O\.?\s*Box\s+[0-9]+|[0-9]{1,6}\s+.{0,100}(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd|drive|dr\.?|lane|ln\.?|highway|hwy\.?|way|court|ct\.?|parkway|pkwy\.?|place|pl\.?|circle|cir\.?)([^a-z]|$))'
$$;

comment on function public.luminari_source_address_publishable_v2(text) is
  'Conservative source-address validator using PostgreSQL ARE-compatible boundaries. Replaces the invalid backslash-b word-boundary assumption used by fresh snapshot v2.3.';

revoke all on function public.luminari_source_address_publishable_v2(text) from public,anon,authenticated;
grant execute on function public.luminari_source_address_publishable_v2(text) to service_role;

create or replace function public.create_luminari_resource_snapshot_v2_4(
  p_snapshot_version text,
  p_quality_lanes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_base_result jsonb;
  v_snapshot_id uuid;
  v_address_count integer:=0;
  v_receipt_hash text;
begin
  v_base_result:=public.create_luminari_resource_snapshot_v2_3(
    p_snapshot_version,
    p_quality_lanes
  );
  v_snapshot_id:=(v_base_result->>'snapshot_id')::uuid;

  with lanes as (
    select x.run_id::uuid as run_id,x.quality_version,x.lane_priority
    from jsonb_to_recordset(p_quality_lanes)
      as x(run_id text,quality_version text,lane_priority integer)
  ), projected as (
    select i.resource_entity_id,
      (array_agg(c.address order by l.lane_priority desc,q.source_priority desc,c.candidate_key)
        filter(where public.luminari_source_address_publishable_v2(c.address)))[1] as best_address,
      (array_agg(c.candidate_key order by l.lane_priority desc,q.source_priority desc,c.candidate_key)
        filter(where public.luminari_source_address_publishable_v2(c.address)))[1] as address_candidate_key
    from public.luminari_resource_snapshot_identity_v1 i
    cross join lateral jsonb_array_elements_text(i.candidate_keys) candidate(candidate_key)
    join public.luminari_corpus_candidate_v1 c
      on c.candidate_key=candidate.candidate_key
    join public.luminari_corpus_resource_quality_v1 q
      on q.candidate_key=c.candidate_key
    join lanes l
      on l.run_id=q.run_id and l.quality_version=q.quality_version
    where i.snapshot_id=v_snapshot_id
    group by i.resource_entity_id
  )
  update public.luminari_resource_snapshot_identity_v1 i
  set address=p.best_address,
      provenance=i.provenance||jsonb_build_object(
        'field_projection','best_source_attached_field_v2',
        'address_validator','source_address_quality_v2',
        'address_candidate_key',p.address_candidate_key
      ),
      identity_receipt_hash=encode(digest(
        i.identity_key||'|'||i.resolution_state||'|'||i.candidate_keys::text||'|'||
        i.source_artifacts::text||'|'||i.quality_lanes::text||'|'||
        coalesce(i.provenance->>'phone_candidate_key','')||'|'||
        coalesce(i.provenance->>'email_candidate_key','')||'|'||
        coalesce(i.provenance->>'website_candidate_key','')||'|'||
        coalesce(p.address_candidate_key,''),
        'sha256'
      ),'hex')
  from projected p
  where i.snapshot_id=v_snapshot_id
    and i.resource_entity_id=p.resource_entity_id;

  select count(*) filter(where address is not null)::int
  into v_address_count
  from public.luminari_resource_snapshot_identity_v1
  where snapshot_id=v_snapshot_id and resolution_state='resolved';

  select encode(digest(
    p_snapshot_version||'|'||p_quality_lanes::text||'|'||
    coalesce(string_agg(identity_receipt_hash,'|' order by identity_key),''),
    'sha256'
  ),'hex')
  into v_receipt_hash
  from public.luminari_resource_snapshot_identity_v1
  where snapshot_id=v_snapshot_id;

  update public.luminari_resource_snapshot_v1
  set receipt_hash=v_receipt_hash,
      metadata=metadata||jsonb_build_object(
        'identity_engine','fresh_resource_identity_v2_3',
        'field_projection','best_source_attached_field_v2',
        'address_validator','source_address_quality_v2',
        'resolved_resources_with_source_address',v_address_count,
        'publication_mutated',false
      )
  where snapshot_id=v_snapshot_id and status='sealed' and is_current=false;

  return v_base_result||jsonb_build_object(
    'snapshot_version',p_snapshot_version,
    'field_projection','best_source_attached_field_v2',
    'address_validator','source_address_quality_v2',
    'resolved_resources_with_source_address',v_address_count,
    'receipt_hash',v_receipt_hash,
    'activated',false
  );
end;
$$;

comment on function public.create_luminari_resource_snapshot_v2_4(text,jsonb) is
  'Creates a sealed v2.3 identity snapshot and re-projects source-attached addresses with PostgreSQL-compatible validation before recomputing all receipts.';

revoke all on function public.create_luminari_resource_snapshot_v2_4(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_luminari_resource_snapshot_v2_4(text,jsonb) to service_role;
