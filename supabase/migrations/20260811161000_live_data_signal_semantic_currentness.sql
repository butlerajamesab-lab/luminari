-- Lighthouse currentness contract for Atlas Domain 3 signal projections.
--
-- Atlas candidate versions are retained as history. Lighthouse must expose one
-- current row per semantic pattern while preserving every superseded version.

alter table public.live_data_signals
  add column if not exists atlas_candidate_id uuid,
  add column if not exists atlas_candidate_hash text,
  add column if not exists atlas_semantic_key text;

create or replace function public.live_data_signal_semantic_key_v1(
  p_detection_rule_id text,
  p_signal_type text,
  p_primary_stream_id text,
  p_jurisdiction_id text,
  p_title text
)
returns text
language sql
immutable
set search_path = pg_catalog, extensions, pg_temp
as $$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws(
          chr(31),
          coalesce(p_detection_rule_id, ''),
          coalesce(p_signal_type, ''),
          coalesce(p_primary_stream_id, ''),
          coalesce(p_jurisdiction_id, ''),
          coalesce(p_title, '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

update public.live_data_signals
   set atlas_semantic_key = public.live_data_signal_semantic_key_v1(
     detection_rule_id,
     signal_type,
     primary_stream_id,
     jurisdiction_id,
     title
   )
 where atlas_semantic_key is null;

with ranked as (
  select
    live_data_signal_id,
    atlas_semantic_key,
    row_number() over (
      partition by atlas_semantic_key
      order by created_at desc, detected_at desc, live_data_signal_id desc
    ) as current_rank,
    lag(live_data_signal_id) over (
      partition by atlas_semantic_key
      order by created_at asc, detected_at asc, live_data_signal_id asc
    ) as prior_signal_id
  from public.live_data_signals
)
update public.live_data_signals signal
   set is_current = (ranked.current_rank = 1),
       supersedes_id = ranked.prior_signal_id
  from ranked
 where ranked.live_data_signal_id = signal.live_data_signal_id;

alter table public.live_data_signals
  alter column atlas_semantic_key set not null;

alter table public.live_data_signals
  drop constraint if exists live_data_signals_atlas_semantic_key_check;
alter table public.live_data_signals
  add constraint live_data_signals_atlas_semantic_key_check
  check (atlas_semantic_key ~ '^[0-9a-f]{64}$');

alter table public.live_data_signals
  drop constraint if exists live_data_signals_atlas_candidate_hash_check;
alter table public.live_data_signals
  add constraint live_data_signals_atlas_candidate_hash_check
  check (atlas_candidate_hash is null or atlas_candidate_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists live_data_signals_one_current_semantic_idx
  on public.live_data_signals (atlas_semantic_key)
  where is_current;

create index if not exists live_data_signals_semantic_history_idx
  on public.live_data_signals (
    atlas_semantic_key,
    is_current,
    created_at desc,
    live_data_signal_id
  );

comment on column public.live_data_signals.atlas_candidate_id is
  'Atlas candidate version identity supplied by the canonical Atlas bridge.';
comment on column public.live_data_signals.atlas_candidate_hash is
  'Atlas content/version hash for this projected candidate version.';
comment on column public.live_data_signals.atlas_semantic_key is
  'Stable semantic pattern identity used to retain history while exposing one current projection.';

create or replace function public.register_live_data_signal_v1(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_hash text;
  v_input_hash text;
  v_signal_id uuid;
  v_existing_id uuid;
  v_prior_current_id uuid;
  v_entity_ids text[];
  v_atlas_candidate_id uuid;
  v_atlas_candidate_hash text;
  v_semantic_key text;
  v_supplied_semantic_key text;
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

  v_semantic_key := public.live_data_signal_semantic_key_v1(
    p_record->>'detection_rule_id',
    p_record->>'signal_type',
    p_record->>'primary_stream_id',
    p_record->>'jurisdiction_id',
    p_record->>'title'
  );
  v_supplied_semantic_key := nullif(p_record->>'atlas_semantic_key','');
  if v_supplied_semantic_key is not null and v_supplied_semantic_key <> v_semantic_key then
    raise exception 'atlas_semantic_key_mismatch';
  end if;

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

  select live_data_signal_id
    into v_existing_id
    from public.live_data_signals
   where signal_hash = v_hash
   limit 1;

  select live_data_signal_id
    into v_prior_current_id
    from public.live_data_signals
   where atlas_semantic_key = v_semantic_key
     and is_current is true
     and (v_existing_id is null or live_data_signal_id <> v_existing_id)
   order by created_at desc, live_data_signal_id desc
   limit 1
   for update;

  if v_prior_current_id is not null then
    update public.live_data_signals
       set is_current = false
     where live_data_signal_id = v_prior_current_id;
  end if;

  if v_existing_id is not null then
    update public.live_data_signals
       set is_current = true,
           supersedes_id = coalesce(v_prior_current_id, supersedes_id),
           atlas_candidate_id = coalesce(v_atlas_candidate_id, atlas_candidate_id),
           atlas_candidate_hash = coalesce(v_atlas_candidate_hash, atlas_candidate_hash),
           atlas_semantic_key = v_semantic_key,
           input_hash = v_input_hash,
           source_freshness_at = (p_record->>'source_freshness_at')::timestamptz,
           governance_status = coalesce(nullif(p_record->>'governance_status',''),'observation_candidate')
     where live_data_signal_id = v_existing_id;
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
  returning live_data_signal_id into v_signal_id;

  return v_signal_id;
end
$$;
