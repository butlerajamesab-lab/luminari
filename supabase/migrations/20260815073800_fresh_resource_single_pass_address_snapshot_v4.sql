do $migration$
declare
  v_definition text;
  v_occurrences integer;
begin
  select pg_get_functiondef(
    'public.create_luminari_resource_snapshot_v2_3(text,jsonb)'::regprocedure
  ) into v_definition;

  v_occurrences:=(length(v_definition)-length(replace(v_definition,'c.address is not null','')))
    / length('c.address is not null');
  if v_occurrences<>2 then
    raise exception 'resource_snapshot_v2_3_address_filter_contract_changed:%',v_occurrences;
  end if;

  v_definition:=replace(
    v_definition,
    'public.create_luminari_resource_snapshot_v2_3',
    'public.create_luminari_resource_snapshot_v2_6_core'
  );
  v_definition:=regexp_replace(
    v_definition,
    $candidate_filter$c\.address is not null[[:space:]]+and c\.address !~\* '[^']+'[[:space:]]+and trim\(c\.address\) !~\* '[^']+'[[:space:]]+and c\.address ~\* '[^']+'$candidate_filter$,
    'public.luminari_source_address_preserved_v3(c.address)',
    'g'
  );
  v_definition:=replace(
    v_definition,
    'best_source_attached_field_v1',
    'best_source_attached_field_v3'
  );
  v_definition:=replace(
    v_definition,
    $old$'website_candidate_key',ch.website_candidate_key,'address_candidate_key',ch.address_candidate_key,$old$,
    $new$'website_candidate_key',ch.website_candidate_key,
      'address_policy','preserve_source_address_v3',
      'address_validation_state',public.luminari_source_address_shape_v3(ch.best_address),
      'address_candidate_key',ch.address_candidate_key,$new$
  );

  if v_definition like '%c.address is not null%' then
    raise exception 'resource_snapshot_v2_6_invalid_address_filter_survived';
  end if;
  execute v_definition;
end;
$migration$;

create or replace function public.create_luminari_resource_snapshot_v2_6(
  p_snapshot_version text,
  p_quality_lanes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_result jsonb;
  v_snapshot_id uuid;
  v_address_count integer:=0;
  v_noncanonical_count integer:=0;
begin
  -- Build identity, source fields, provenance, and receipts in one pass. This
  -- avoids the unbounded post-snapshot projection that exceeded pg_cron's
  -- statement budget in v2.4/v2.5.
  v_result:=public.create_luminari_resource_snapshot_v2_6_core(
    p_snapshot_version,
    p_quality_lanes
  );
  v_snapshot_id:=(v_result->>'snapshot_id')::uuid;

  select count(*) filter(where address is not null)::int,
         count(*) filter(
           where address is not null
             and provenance->>'address_validation_state'='source_text_noncanonical'
         )::int
  into v_address_count,v_noncanonical_count
  from public.luminari_resource_snapshot_identity_v1
  where snapshot_id=v_snapshot_id and resolution_state='resolved';

  update public.luminari_resource_snapshot_v1
  set metadata=metadata||jsonb_build_object(
    'field_projection','best_source_attached_field_v3',
    'address_policy','preserve_source_address_v3',
    'resolved_resources_with_source_address',v_address_count,
    'resolved_noncanonical_source_addresses',v_noncanonical_count,
    'publication_mutated',false
  )
  where snapshot_id=v_snapshot_id and status='sealed' and is_current=false;

  return v_result||jsonb_build_object(
    'field_projection','best_source_attached_field_v3',
    'address_policy','preserve_source_address_v3',
    'resolved_resources_with_source_address',v_address_count,
    'resolved_noncanonical_source_addresses',v_noncanonical_count,
    'activated',false
  );
end;
$$;

comment on function public.create_luminari_resource_snapshot_v2_6(text,jsonb) is
  'Builds a sealed identity snapshot and preserves source-attached address evidence in the primary aggregation pass, with formatting quality recorded separately.';

revoke all on function public.create_luminari_resource_snapshot_v2_6_core(text,jsonb) from public,anon,authenticated;
revoke all on function public.create_luminari_resource_snapshot_v2_6(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_luminari_resource_snapshot_v2_6(text,jsonb) to service_role;
