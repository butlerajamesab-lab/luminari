alter table public.luminari_corpus_source_artifact_v1
  add column if not exists storage_state text not null default 'active',
  add column if not exists storage_missing_observed_at timestamptz;

create index if not exists luminari_corpus_source_artifact_storage_state_idx
  on public.luminari_corpus_source_artifact_v1(storage_state,extraction_status,observed_at);

create or replace function public.sync_luminari_corpus_source_manifest_v2()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,storage,pg_temp
as $$
declare
  v_storage_objects integer:=0;
  v_new_or_changed integer:=0;
  v_missing integer:=0;
  v_active_manifest integer:=0;
  v_pending integer:=0;
begin
  select count(*)::int
  into v_storage_objects
  from storage.objects o
  where o.bucket_id in ('State Enriched Registry bucket','Everything backbone related');

  select count(*)::int
  into v_new_or_changed
  from storage.objects o
  left join public.luminari_corpus_source_artifact_v1 a
    on a.artifact_key=o.bucket_id||'/'||o.name
  where o.bucket_id in ('State Enriched Registry bucket','Everything backbone related')
    and (
      a.artifact_key is null
      or a.storage_state<>'active'
      or a.transport_etag is distinct from o.metadata->>'eTag'
      or a.byte_size is distinct from coalesce((o.metadata->>'size')::bigint,0)
      or a.mimetype is distinct from o.metadata->>'mimetype'
      or a.storage_updated_at is distinct from o.updated_at
    );

  insert into public.luminari_corpus_source_artifact_v1 as current_artifact (
    artifact_key,bucket_id,object_name,transport_etag,byte_size,mimetype,artifact_role,
    jurisdiction_hint,semantic_family,generation_label,storage_created_at,storage_updated_at,
    observed_at,metadata,storage_state,storage_missing_observed_at
  )
  select
    o.bucket_id||'/'||o.name,
    o.bucket_id,
    o.name,
    o.metadata->>'eTag',
    coalesce((o.metadata->>'size')::bigint,0),
    o.metadata->>'mimetype',
    case
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%ENRICHED-PASS%' then 'state_enrichment_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%RESOURCE-DIRECTORY%' then 'state_resource_directory_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ~* 'registry[-_ (]' then 'state_registry_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%DEEP-DIVE%' then 'domain_deep_dive_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%ADDENDUM%' then 'addendum_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%CLAIM-CATALOG%' then 'claim_catalog_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%GAP-PLAYBOOK%' then 'gap_playbook_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%BENEFITS-CASCADE%' then 'benefits_cascade_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%SOL-COLLISION%' then 'sol_collision_source'
      when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%FEDERAL-%' then 'federal_reference_source'
      when o.bucket_id='Everything backbone related' and o.name ilike '%.xlsx' then 'structured_workbook_source'
      when o.bucket_id='Everything backbone related' and coalesce(o.metadata->>'mimetype','')='application/json' then 'structured_backbone_source'
      when o.bucket_id='Everything backbone related' and coalesce(o.metadata->>'mimetype','') in ('text/csv','binary/octet-stream') and o.name ~* '(jsonl|csv|legislator)' then 'structured_backbone_source'
      when o.bucket_id='Everything backbone related' and o.name ilike '%.sql' then 'derivative_sql_artifact'
      when o.bucket_id='Everything backbone related' and o.name ilike '%.zip' then 'derivative_bundle_artifact'
      else 'unclassified_source'
    end,
    state_match.state_code,
    lower(regexp_replace(
      regexp_replace(o.name,'\.(docx|xlsx|json|jsonl|csv|sql|zip|md|pdf)$','','i'),
      '[-_ ]?(enriched[-_ ]?pass[0-9]*|resource[-_ ]?directory|2026|\([0-9]+\)|[0-9]+)$','','i'
    )),
    case
      when o.name ~* 'ENRICHED-PASS([0-9]+)' then substring(o.name from '(?i)ENRICHED-PASS([0-9]+)')
      when o.name ~* 'RESOURCE-DIRECTORY' then 'resource_directory'
      when o.name ~* 'DEEP-DIVE' then 'deep_dive'
      when o.name ~* 'ADDENDUM' then 'addendum'
      else null
    end,
    o.created_at,
    o.updated_at,
    now(),
    jsonb_build_object(
      'storage_metadata',o.metadata,
      'manifest_version','fresh_corpus_continuous_manifest_v2',
      'storage_state','active'
    ),
    'active',
    null
  from storage.objects o
  left join lateral (
    select s.state_code
    from (values
      ('alabama','AL'),('alaska','AK'),('arizona','AZ'),('arkansas','AR'),('california','CA'),
      ('colorado','CO'),('connecticut','CT'),('delaware','DE'),('florida','FL'),('georgia','GA'),
      ('hawaii','HI'),('idaho','ID'),('illinois','IL'),('indiana','IN'),('iowa','IA'),
      ('kansas','KS'),('kentucky','KY'),('louisiana','LA'),('maine','ME'),('maryland','MD'),
      ('massachusetts','MA'),('michigan','MI'),('minnesota','MN'),('mississippi','MS'),('missouri','MO'),
      ('montana','MT'),('nebraska','NE'),('nevada','NV'),('new-hampshire','NH'),('new-jersey','NJ'),
      ('new-mexico','NM'),('newmexico','NM'),('new-york','NY'),('north-carolina','NC'),('northcarolina','NC'),
      ('north-dakota','ND'),('northdakota','ND'),('ohio','OH'),('oklahoma','OK'),('oregon','OR'),
      ('pennsylvania','PA'),('rhode-island','RI'),('south-carolina','SC'),('southcarolina','SC'),
      ('south-dakota','SD'),('southdakota','SD'),('tennessee','TN'),('texas','TX'),('utah','UT'),
      ('vermont','VT'),('west-virginia','WV'),('westvirginia','WV'),('virginia','VA'),
      ('washington-dc','DC'),('washington','WA'),('wisconsin','WI'),('wyoming','WY'),
      ('puerto-rico','PR'),('guam','GU'),('american-samoa','AS'),('northern-mariana','MP'),
      ('cnmi','MP'),('virgin-islands','VI')
    ) as s(name_slug,state_code)
    where regexp_replace(lower(o.name),'[^a-z0-9]+','-','g')
      ~ ('(^|-)'||s.name_slug||'(-|$)')
    order by length(s.name_slug) desc
    limit 1
  ) state_match on true
  where o.bucket_id in ('State Enriched Registry bucket','Everything backbone related')
  on conflict(artifact_key) do update set
    transport_etag=excluded.transport_etag,
    byte_size=excluded.byte_size,
    mimetype=excluded.mimetype,
    artifact_role=excluded.artifact_role,
    jurisdiction_hint=excluded.jurisdiction_hint,
    semantic_family=excluded.semantic_family,
    generation_label=excluded.generation_label,
    storage_created_at=excluded.storage_created_at,
    storage_updated_at=excluded.storage_updated_at,
    content_sha256=case
      when current_artifact.transport_etag is distinct from excluded.transport_etag
        or current_artifact.byte_size is distinct from excluded.byte_size
        or current_artifact.storage_updated_at is distinct from excluded.storage_updated_at
      then null else current_artifact.content_sha256 end,
    extracted_text_sha256=case
      when current_artifact.transport_etag is distinct from excluded.transport_etag
        or current_artifact.byte_size is distinct from excluded.byte_size
        or current_artifact.storage_updated_at is distinct from excluded.storage_updated_at
      then null else current_artifact.extracted_text_sha256 end,
    extraction_status=case
      when current_artifact.transport_etag is distinct from excluded.transport_etag
        or current_artifact.byte_size is distinct from excluded.byte_size
        or current_artifact.storage_updated_at is distinct from excluded.storage_updated_at
      then 'pending' else current_artifact.extraction_status end,
    observed_at=now(),
    metadata=(current_artifact.metadata-'storage_missing_observed_at')||excluded.metadata,
    storage_state='active',
    storage_missing_observed_at=null;

  with missing as (
    update public.luminari_corpus_source_artifact_v1 a
    set storage_state='missing',
        storage_missing_observed_at=coalesce(a.storage_missing_observed_at,now()),
        observed_at=now(),
        metadata=a.metadata||jsonb_build_object(
          'storage_state','missing',
          'storage_missing_observed_at',coalesce(a.storage_missing_observed_at,now())
        )
    where a.storage_state='active'
      and a.bucket_id in ('State Enriched Registry bucket','Everything backbone related')
      and not exists (
        select 1 from storage.objects o
        where o.bucket_id=a.bucket_id and o.name=a.object_name
      )
    returning 1
  )
  select count(*)::int into v_missing from missing;

  update public.luminari_corpus_source_artifact_v1
  set exact_duplicate_of=null
  where storage_state='active';

  with ranked as (
    select artifact_key,
      first_value(artifact_key) over(partition by transport_etag,byte_size order by artifact_key) canonical_artifact,
      row_number() over(partition by transport_etag,byte_size order by artifact_key) duplicate_rank
    from public.luminari_corpus_source_artifact_v1
    where storage_state='active' and transport_etag is not null
  )
  update public.luminari_corpus_source_artifact_v1 a
  set exact_duplicate_of=case when r.duplicate_rank>1 then r.canonical_artifact else null end
  from ranked r
  where r.artifact_key=a.artifact_key;

  select count(*)::int,
         count(*) filter(where extraction_status='pending')::int
  into v_active_manifest,v_pending
  from public.luminari_corpus_source_artifact_v1
  where storage_state='active';

  return jsonb_build_object(
    'contract','fresh_corpus_continuous_manifest_v2',
    'storage_objects',v_storage_objects,
    'active_manifest_artifacts',v_active_manifest,
    'new_or_changed_artifacts',v_new_or_changed,
    'newly_missing_artifacts',v_missing,
    'pending_extraction_artifacts',v_pending,
    'source_objects_deleted',0,
    'synced_at',clock_timestamp()
  );
end;
$$;

comment on function public.sync_luminari_corpus_source_manifest_v2() is
  'Continuously reconciles the two authoritative Storage buckets into the fresh source manifest. Changes reset derived hashes; missing objects are tombstoned without deleting source history.';

revoke all on function public.sync_luminari_corpus_source_manifest_v2() from public,anon,authenticated;
grant execute on function public.sync_luminari_corpus_source_manifest_v2() to service_role;
