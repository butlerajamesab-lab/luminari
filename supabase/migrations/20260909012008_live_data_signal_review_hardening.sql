-- Forward hardening for unresolved Atlas/Lighthouse semantic-currentness review findings.
--
-- 1. Re-key and re-rank preserved cross-category history after removing the
--    incidental primary stream from semantic identity.
-- 2. Make an exact replay of an already-current legacy row idempotent.
-- 3. Enforce the transition evidence table's append-only contract in the
--    database, including for direct service-role writers.

drop index if exists public.live_data_signals_one_current_atlas_semantic_idx;

-- The existing immutability trigger intentionally permits only is_current
-- changes. This bounded migration also repairs the system-owned semantic key,
-- so disable only that named trigger inside this transactional migration.
alter table public.live_data_signals
  disable trigger live_data_signals_immutable_v1;

update public.live_data_signals
   set atlas_semantic_key = public.live_data_signal_semantic_key_v2(
     detection_rule_id,
     signal_type,
     primary_stream_id,
     jurisdiction_id,
     title,
     entity_ids
   )
 where detection_rule_id = 'atlas.domain3.cross_category_entity'
   and atlas_semantic_key is distinct from public.live_data_signal_semantic_key_v2(
     detection_rule_id,
     signal_type,
     primary_stream_id,
     jurisdiction_id,
     title,
     entity_ids
   );

with ranked as (
  select
    live_data_signal_id,
    row_number() over (
      partition by atlas_semantic_key
      order by created_at desc, detected_at desc, live_data_signal_id desc
    ) as current_rank
  from public.live_data_signals
  where detection_rule_id = 'atlas.domain3.cross_category_entity'
)
update public.live_data_signals signal
   set is_current = (ranked.current_rank = 1)
  from ranked
 where ranked.live_data_signal_id = signal.live_data_signal_id
   and signal.is_current is distinct from (ranked.current_rank = 1);

alter table public.live_data_signals
  enable trigger live_data_signals_immutable_v1;

create unique index live_data_signals_one_current_atlas_semantic_idx
  on public.live_data_signals (atlas_semantic_key)
  where is_current and atlas_semantic_key is not null;

create or replace function public.guard_live_data_signal_semantic_transition_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'live_data_signal_semantic_transition_v1 is append-only';
end
$function$;

revoke all on function public.guard_live_data_signal_semantic_transition_immutable_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists live_data_signal_semantic_transition_immutable_v1
  on public.live_data_signal_semantic_transition_v1;
create trigger live_data_signal_semantic_transition_immutable_v1
before update or delete on public.live_data_signal_semantic_transition_v1
for each row execute function public.guard_live_data_signal_semantic_transition_immutable_v1();

revoke insert, update, delete
  on public.live_data_signal_semantic_transition_v1
  from public, anon, authenticated, service_role;
grant select
  on public.live_data_signal_semantic_transition_v1
  to service_role;

create or replace function public.live_data_signal_semantic_key_v2(
  p_detection_rule_id text,
  p_signal_type text,
  p_primary_stream_id text,
  p_jurisdiction_id text,
  p_title text,
  p_entity_ids text[]
)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'extensions', 'pg_temp'
as $function$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws(
          chr(31),
          coalesce(p_detection_rule_id, ''),
          coalesce(p_signal_type, ''),
          case
            when p_detection_rule_id = 'atlas.domain3.cross_category_entity' then ''
            else coalesce(p_primary_stream_id, '')
          end,
          coalesce(p_jurisdiction_id, ''),
          coalesce(p_title, ''),
          case
            when p_detection_rule_id = 'atlas.propublica_unresolved_filing_metadata_rate'
              then coalesce((select string_agg(value, chr(30) order by value) from unnest(coalesce(p_entity_ids, array[]::text[])) value), '')
            else ''
          end
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$function$;

create or replace function public.register_live_data_signal_v1(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_hash text;
  v_input_hash text;
  v_signal_id uuid;
  v_existing_id uuid;
  v_existing_is_current boolean;
  v_existing_supersedes_id uuid;
  v_prior_current_id uuid;
  v_requested_supersedes_id uuid;
  v_entity_ids text[];
  v_atlas_candidate_id uuid;
  v_atlas_candidate_hash text;
  v_semantic_key text;
  v_supplied_semantic_key text;
  v_transition_reason text;
  v_transition_hash text;
begin
  if coalesce(p_record->>'signal_type','')=''
     or coalesce(p_record->>'title','')=''
     or coalesce(p_record->>'description','')=''
     or coalesce(p_record->>'primary_stream_id','')=''
     or coalesce(p_record->>'entity_resolution_status','')=''
     or coalesce(p_record->>'jurisdiction_id','')=''
     or coalesce(p_record->>'severity','')=''
     or p_record->>'confidence_score' is null
     or coalesce(p_record->>'verification_state','')=''
     or coalesce(p_record->>'detection_rule_id','')=''
     or coalesce(p_record->>'detection_rule_version','')=''
     or coalesce(p_record->>'engine_id','')=''
     or coalesce(p_record->>'engine_version','')=''
     or coalesce(p_record->>'source_freshness_at','')=''
     or coalesce(p_record->>'detected_at','')='' then
    raise exception 'live-data signal is missing required evidence, entity, score, engine, or rule fields';
  end if;

  if coalesce(jsonb_typeof(p_record->'source_event_refs'),'') <> 'array'
     or coalesce(jsonb_array_length(p_record->'source_event_refs'),0)=0 then
    raise exception 'live-data signal requires at least one Atlas source event reference';
  end if;
  if coalesce(jsonb_typeof(p_record->'supporting_statistics'),'') <> 'object'
     or p_record->'supporting_statistics'='{}'::jsonb then
    raise exception 'live-data signal requires non-empty supporting statistics';
  end if;

  select coalesce(array_agg(value),array[]::text[])
    into v_entity_ids
    from jsonb_array_elements_text(coalesce(p_record->'entity_ids','[]'::jsonb)) as value;

  v_semantic_key := public.live_data_signal_semantic_key_v2(
    p_record->>'detection_rule_id',
    p_record->>'signal_type',
    p_record->>'primary_stream_id',
    p_record->>'jurisdiction_id',
    p_record->>'title',
    v_entity_ids
  );
  v_supplied_semantic_key := nullif(p_record->>'atlas_semantic_key','');
  if v_supplied_semantic_key is not null and v_supplied_semantic_key <> v_semantic_key then
    raise exception 'atlas_semantic_key_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_semantic_key, 0));

  v_atlas_candidate_hash := nullif(p_record->>'atlas_candidate_hash','');
  if v_atlas_candidate_hash is not null
     and v_atlas_candidate_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'atlas_candidate_hash_invalid';
  end if;
  begin
    v_atlas_candidate_id := nullif(p_record->>'atlas_candidate_id','')::uuid;
  exception when others then
    raise exception 'atlas_candidate_id_invalid';
  end;

  if nullif(p_record->>'supersedes_id','') is not null then
    if v_atlas_candidate_hash is not null then
      raise exception 'atlas_v2_supersedes_id_not_permitted';
    end if;
    begin
      v_requested_supersedes_id := nullif(p_record->>'supersedes_id','')::uuid;
    exception when others then
      raise exception 'legacy_supersedes_id_invalid';
    end;
  end if;

  v_input_hash := public.signal_architecture_hash_v1(p_record - 'created_at');

  if v_atlas_candidate_hash is not null then
    v_hash := public.signal_architecture_hash_v1(jsonb_build_object(
      'projection_contract','atlas_domain3_candidate_projection_v2',
      'atlas_candidate_hash',v_atlas_candidate_hash,
      'atlas_semantic_key',v_semantic_key,
      'detection_rule_id',p_record->>'detection_rule_id',
      'detection_rule_version',p_record->>'detection_rule_version',
      'engine_id',p_record->>'engine_id',
      'engine_version',p_record->>'engine_version'
    ));
  else
    v_hash := public.signal_architecture_hash_v1(jsonb_build_object(
      'domain','live_data',
      'signal_type',p_record->>'signal_type',
      'title',p_record->>'title',
      'description',p_record->>'description',
      'primary_stream_id',p_record->>'primary_stream_id',
      'source_event_refs',p_record->'source_event_refs',
      'entity_ids',coalesce(p_record->'entity_ids','[]'::jsonb),
      'entity_resolution_status',p_record->>'entity_resolution_status',
      'jurisdiction_id',p_record->>'jurisdiction_id',
      'severity',p_record->>'severity',
      'confidence_score',p_record->>'confidence_score',
      'verification_state',p_record->>'verification_state',
      'supporting_statistics',p_record->'supporting_statistics',
      'evidence_refs',coalesce(p_record->'evidence_refs','[]'::jsonb),
      'detection_rule_id',p_record->>'detection_rule_id',
      'detection_rule_version',p_record->>'detection_rule_version',
      'engine_id',p_record->>'engine_id',
      'engine_version',p_record->>'engine_version',
      'source_freshness_at',p_record->>'source_freshness_at',
      'detected_at',p_record->>'detected_at'
    ));
  end if;

  select live_data_signal_id, is_current, supersedes_id
    into v_existing_id, v_existing_is_current, v_existing_supersedes_id
    from public.live_data_signals
   where signal_hash = v_hash
   limit 1;

  select live_data_signal_id
    into v_prior_current_id
    from public.live_data_signals
   where public.live_data_signal_semantic_key_v2(
           detection_rule_id,
           signal_type,
           primary_stream_id,
           jurisdiction_id,
           title,
           entity_ids
         ) = v_semantic_key
     and is_current is true
     and (v_existing_id is null or live_data_signal_id <> v_existing_id)
   order by created_at desc, live_data_signal_id desc
   limit 1
   for update;

  -- A replay of the already-current exact content is a no-op. Validate a
  -- supplied legacy predecessor against the immutable stored lineage, then
  -- return without appending a transition that did not occur.
  if v_existing_id is not null
     and v_existing_is_current is true
     and v_prior_current_id is null then
    if v_requested_supersedes_id is not null
       and v_requested_supersedes_id is distinct from v_existing_supersedes_id then
      raise exception 'legacy_supersedes_id_conflicts_with_existing';
    end if;
    return v_existing_id;
  end if;

  if v_requested_supersedes_id is not null then
    perform 1
      from public.live_data_signals
     where live_data_signal_id = v_requested_supersedes_id
     for update;
    if not found then
      raise exception 'legacy_supersedes_id_not_found';
    end if;
    if v_existing_id is not null and v_requested_supersedes_id = v_existing_id then
      raise exception 'legacy_supersedes_id_self_reference';
    end if;
    if v_prior_current_id is not null and v_prior_current_id <> v_requested_supersedes_id then
      raise exception 'legacy_supersedes_id_conflicts_with_semantic_current';
    end if;
    v_prior_current_id := v_requested_supersedes_id;
  end if;

  if v_prior_current_id is not null then
    update public.live_data_signals
       set is_current = false
     where live_data_signal_id = v_prior_current_id;
  end if;

  if v_existing_id is not null then
    update public.live_data_signals
       set is_current = true
     where live_data_signal_id = v_existing_id;

    if v_prior_current_id is not null then
      v_transition_reason := 'reactivated_version';
      v_transition_hash := public.signal_architecture_hash_v1(jsonb_build_object(
        'semantic_key',v_semantic_key,
        'previous_live_data_signal_id',v_prior_current_id,
        'current_live_data_signal_id',v_existing_id,
        'atlas_candidate_id',v_atlas_candidate_id,
        'atlas_candidate_hash',v_atlas_candidate_hash,
        'transition_reason',v_transition_reason
      ));
      insert into public.live_data_signal_semantic_transition_v1(
        semantic_key,previous_live_data_signal_id,current_live_data_signal_id,
        atlas_candidate_id,atlas_candidate_hash,transition_reason,transition_hash
      ) values (
        v_semantic_key,v_prior_current_id,v_existing_id,
        v_atlas_candidate_id,v_atlas_candidate_hash,v_transition_reason,v_transition_hash
      );
    end if;
    return v_existing_id;
  end if;

  insert into public.live_data_signals(
    signal_type,title,description,primary_stream_id,source_event_refs,
    entity_ids,entity_resolution_status,jurisdiction_id,severity,
    confidence_score,verification_state,supporting_statistics,evidence_refs,
    detection_rule_id,detection_rule_version,engine_id,engine_version,
    input_hash,signal_hash,source_freshness_at,detected_at,governance_status,
    supersedes_id,is_current,atlas_candidate_id,atlas_candidate_hash,
    atlas_semantic_key
  ) values (
    p_record->>'signal_type',
    p_record->>'title',
    p_record->>'description',
    p_record->>'primary_stream_id',
    p_record->'source_event_refs',
    v_entity_ids,
    p_record->>'entity_resolution_status',
    p_record->>'jurisdiction_id',
    p_record->>'severity',
    (p_record->>'confidence_score')::numeric,
    p_record->>'verification_state',
    p_record->'supporting_statistics',
    coalesce(p_record->'evidence_refs','[]'::jsonb),
    p_record->>'detection_rule_id',
    p_record->>'detection_rule_version',
    p_record->>'engine_id',
    p_record->>'engine_version',
    v_input_hash,
    v_hash,
    (p_record->>'source_freshness_at')::timestamptz,
    (p_record->>'detected_at')::timestamptz,
    coalesce(nullif(p_record->>'governance_status',''),'observation_candidate'),
    v_prior_current_id,
    true,
    v_atlas_candidate_id,
    v_atlas_candidate_hash,
    v_semantic_key
  )
  on conflict (signal_hash) do nothing
  returning live_data_signal_id into v_signal_id;

  if v_signal_id is null then
    select live_data_signal_id
      into v_existing_id
      from public.live_data_signals
     where signal_hash = v_hash
     limit 1;
    if v_existing_id is null then
      raise exception 'live_data_signal_conflict_without_readback';
    end if;

    update public.live_data_signals
       set is_current = true
     where live_data_signal_id = v_existing_id;

    if v_prior_current_id is not null and v_prior_current_id <> v_existing_id then
      v_transition_reason := 'reactivated_version';
      v_transition_hash := public.signal_architecture_hash_v1(jsonb_build_object(
        'semantic_key',v_semantic_key,
        'previous_live_data_signal_id',v_prior_current_id,
        'current_live_data_signal_id',v_existing_id,
        'atlas_candidate_id',v_atlas_candidate_id,
        'atlas_candidate_hash',v_atlas_candidate_hash,
        'transition_reason',v_transition_reason
      ));
      insert into public.live_data_signal_semantic_transition_v1(
        semantic_key,previous_live_data_signal_id,current_live_data_signal_id,
        atlas_candidate_id,atlas_candidate_hash,transition_reason,transition_hash
      ) values (
        v_semantic_key,v_prior_current_id,v_existing_id,
        v_atlas_candidate_id,v_atlas_candidate_hash,v_transition_reason,v_transition_hash
      );
    end if;
    return v_existing_id;
  end if;

  if v_prior_current_id is not null then
    v_transition_reason := 'new_version';
    v_transition_hash := public.signal_architecture_hash_v1(jsonb_build_object(
      'semantic_key',v_semantic_key,
      'previous_live_data_signal_id',v_prior_current_id,
      'current_live_data_signal_id',v_signal_id,
      'atlas_candidate_id',v_atlas_candidate_id,
      'atlas_candidate_hash',v_atlas_candidate_hash,
      'transition_reason',v_transition_reason
    ));
    insert into public.live_data_signal_semantic_transition_v1(
      semantic_key,previous_live_data_signal_id,current_live_data_signal_id,
      atlas_candidate_id,atlas_candidate_hash,transition_reason,transition_hash
    ) values (
      v_semantic_key,v_prior_current_id,v_signal_id,
      v_atlas_candidate_id,v_atlas_candidate_hash,v_transition_reason,v_transition_hash
    );
  end if;

  return v_signal_id;
end
$function$;

comment on function public.live_data_signal_semantic_key_v2(text,text,text,text,text,text[]) is
  'Entity-aware Lighthouse semantic identity aligned with Atlas. ProPublica entity-specific data-quality signals include entity IDs; other governed signal rules retain v1 semantics.';

comment on function public.register_live_data_signal_v1(jsonb) is
  'Registers governed live-data signals using Atlas/Lighthouse semantic identity v2 while preserving immutable v1 historical records.';
