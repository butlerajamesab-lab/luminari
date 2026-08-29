create or replace function public.luminari_source_address_preserved_v3(p_address text)
returns boolean
language sql
immutable
parallel safe
as $$
  select nullif(trim(coalesce(p_address,'')),'') is not null
    and p_address !~* '<\/?w:|<xml|</xml'
    and trim(p_address) !~* '^(not published|not available|unknown([^a-z]|$)|n/?a([^a-z]|$)|none([^a-z]|$)|multiple locations|various locations|statewide([^a-z]|$)|see website|contact |online only|address (available )?(on|at) (the )?website)'
$$;

create or replace function public.luminari_source_address_shape_v3(p_address text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when not public.luminari_source_address_preserved_v3(p_address) then 'rejected_non_address'
    when p_address ~* 'P\.?O\.?\s*Box\s+[0-9]+' then 'po_box'
    when p_address ~* '[0-9]{1,6}\s+.{0,100}(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd|drive|dr\.?|lane|ln\.?|highway|hwy\.?|way|court|ct\.?|parkway|pkwy\.?|place|pl\.?|circle|cir\.?)([^a-z]|$)'
      then 'street_like'
    else 'source_text_noncanonical'
  end
$$;

comment on function public.luminari_source_address_preserved_v3(text) is
  'Preserves nonempty source-attached address text unless it is an explicit placeholder or XML contamination. Formatting quality is recorded separately and never controls preservation.';
comment on function public.luminari_source_address_shape_v3(text) is
  'Classifies preserved address text for review without deleting noncanonical source evidence.';

revoke all on function public.luminari_source_address_preserved_v3(text) from public,anon,authenticated;
revoke all on function public.luminari_source_address_shape_v3(text) from public,anon,authenticated;
grant execute on function public.luminari_source_address_preserved_v3(text) to service_role;
grant execute on function public.luminari_source_address_shape_v3(text) to service_role;

create or replace function public.create_luminari_resource_snapshot_v2_5(
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
  v_noncanonical_count integer:=0;
  v_receipt_hash text;
begin
  v_base_result:=public.create_luminari_resource_snapshot_v2_4(
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
        filter(where public.luminari_source_address_preserved_v3(c.address)))[1] as best_address,
      (array_agg(c.candidate_key order by l.lane_priority desc,q.source_priority desc,c.candidate_key)
        filter(where public.luminari_source_address_preserved_v3(c.address)))[1] as address_candidate_key
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
        'field_projection','best_source_attached_field_v3',
        'address_policy','preserve_source_address_v3',
        'address_validation_state',public.luminari_source_address_shape_v3(p.best_address),
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

  select count(*) filter(where address is not null)::int,
         count(*) filter(where address is not null and provenance->>'address_validation_state'='source_text_noncanonical')::int
  into v_address_count,v_noncanonical_count
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
        'field_projection','best_source_attached_field_v3',
        'address_policy','preserve_source_address_v3',
        'resolved_resources_with_source_address',v_address_count,
        'resolved_noncanonical_source_addresses',v_noncanonical_count,
        'publication_mutated',false
      )
  where snapshot_id=v_snapshot_id and status='sealed' and is_current=false;

  return v_base_result||jsonb_build_object(
    'snapshot_version',p_snapshot_version,
    'field_projection','best_source_attached_field_v3',
    'address_policy','preserve_source_address_v3',
    'resolved_resources_with_source_address',v_address_count,
    'resolved_noncanonical_source_addresses',v_noncanonical_count,
    'receipt_hash',v_receipt_hash,
    'activated',false
  );
end;
$$;

comment on function public.create_luminari_resource_snapshot_v2_5(text,jsonb) is
  'Creates a sealed resource snapshot that preserves source-attached address evidence independently from address formatting quality and mapping eligibility.';

revoke all on function public.create_luminari_resource_snapshot_v2_5(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_luminari_resource_snapshot_v2_5(text,jsonb) to service_role;
