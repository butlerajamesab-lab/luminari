-- Project Atlas-owned Domain 3 integrity candidates into Lighthouse's private
-- human-review substrate. Atlas remains the detector and source owner;
-- Lighthouse only corroborates, governs lifecycle, and creates draft routes.

alter table private.integrity_pattern_candidate
  drop constraint if exists integrity_candidate_type_check;

alter table private.integrity_pattern_candidate
  add constraint integrity_candidate_type_check check (candidate_type in (
    'phoenix_successor_pattern',
    'exact_identifier_reuse_pattern',
    'financial_conduit_pattern',
    'dark_money_pattern',
    'legislative_integrity_anomaly',
    'procurement_integrity_anomaly',
    'contradiction_pattern',
    'numeric_range_anomaly',
    'other'
  ));

alter table private.integrity_evidence_link
  drop constraint if exists integrity_evidence_source_class_check;

alter table private.integrity_evidence_link
  add constraint integrity_evidence_source_class_check check (source_class in (
    'official_primary',
    'official_secondary',
    'court_record',
    'legislative_record',
    'campaign_finance_record',
    'lobbying_disclosure',
    'foreign_agent_registration',
    'regulatory_record',
    'corporate_record',
    'procurement_record',
    'audited_financial_record',
    'journalistic_source',
    'user_supplied',
    'other'
  ));

alter table private.integrity_evidence_link
  add column if not exists provenance_type text not null default 'atlas_projection',
  add column if not exists created_by_id text;

alter table private.integrity_evidence_link
  drop constraint if exists integrity_evidence_provenance_type_check;

alter table private.integrity_evidence_link
  add constraint integrity_evidence_provenance_type_check check (
    provenance_type in ('atlas_projection', 'reviewer')
  );

alter table private.integrity_corroboration_assessment
  add column if not exists assessed_by_type text not null default 'reviewer',
  add column if not exists assessed_by_id text;

alter table private.integrity_corroboration_assessment
  drop constraint if exists integrity_assessment_actor_type_check;

alter table private.integrity_corroboration_assessment
  add constraint integrity_assessment_actor_type_check check (
    assessed_by_type in ('reviewer', 'administrator')
  );

alter table private.integrity_pattern_candidate enable row level security;
alter table private.integrity_evidence_link enable row level security;
alter table private.integrity_corroboration_assessment enable row level security;
alter table private.integrity_candidate_transition enable row level security;
alter table private.integrity_routing_snapshot enable row level security;
alter table private.integrity_escalation_packet enable row level security;

create or replace function public.attach_integrity_candidate_evidence_v1(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_id uuid;
  v_hash text;
begin
  if coalesce(p_record->>'candidate_id','') = ''
     or coalesce(p_record->>'source_class','') = ''
     or coalesce(p_record->>'source_relation','') = ''
     or coalesce(p_record->>'source_record_key','') = ''
     or coalesce(p_record->>'source_content_hash','') = ''
     or coalesce(p_record->>'supports_or_contradicts','') = '' then
    raise exception 'candidate, source identity, source hash, and evidence posture are required';
  end if;

  v_hash := private.integrity_sha256_v1(p_record - 'evidence_hash');

  insert into private.integrity_evidence_link(
    candidate_id,
    source_class,
    source_relation,
    source_record_key,
    source_uri,
    quote_text,
    pinpoint,
    source_content_hash,
    supports_or_contradicts,
    evidence_hash,
    observed_at,
    provenance_type,
    created_by_id
  ) values (
    (p_record->>'candidate_id')::uuid,
    p_record->>'source_class',
    p_record->>'source_relation',
    p_record->>'source_record_key',
    nullif(p_record->>'source_uri',''),
    nullif(p_record->>'quote_text',''),
    nullif(p_record->>'pinpoint',''),
    lower(p_record->>'source_content_hash'),
    p_record->>'supports_or_contradicts',
    v_hash,
    nullif(p_record->>'observed_at','')::timestamptz,
    coalesce(nullif(p_record->>'provenance_type',''), 'atlas_projection'),
    nullif(p_record->>'created_by_id','')
  )
  on conflict (evidence_hash) do nothing
  returning evidence_link_id into v_id;

  if v_id is null then
    select evidence_link_id
    into v_id
    from private.integrity_evidence_link
    where evidence_hash = v_hash;
  end if;
  return v_id;
end;
$$;

create or replace function public.record_integrity_corroboration_v1(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_id uuid;
  v_hash text;
  v_candidate uuid := (p_record->>'candidate_id')::uuid;
  v_state text := p_record->>'assessment_state';
  v_evidence_ids uuid[];
  v_independent_source_count integer;
  v_contradiction_count integer;
  v_source_class_count integer;
begin
  if jsonb_typeof(p_record->'evidence_link_ids') is distinct from 'array' then
    raise exception 'evidence_link_ids must be an array';
  end if;

  select coalesce(array_agg(evidence_id order by evidence_id), array[]::uuid[])
  into v_evidence_ids
  from (
    select distinct value::uuid as evidence_id
    from jsonb_array_elements_text(p_record->'evidence_link_ids')
  ) selected;

  if cardinality(v_evidence_ids) = 0 then
    raise exception 'at least one evidence link is required';
  end if;

  if exists (
    select 1 from unnest(v_evidence_ids) as selected(evidence_id)
    where not exists (
      select 1
      from private.integrity_evidence_link e
      where e.evidence_link_id = evidence_id and e.candidate_id = v_candidate
    )
  ) then
    raise exception 'all evidence links must belong to candidate';
  end if;

  select
    count(distinct e.source_relation)::integer,
    count(*) filter (where e.supports_or_contradicts = 'contradicts')::integer,
    count(distinct e.source_class)::integer
  into v_independent_source_count, v_contradiction_count, v_source_class_count
  from private.integrity_evidence_link e
  where e.candidate_id = v_candidate
    and e.evidence_link_id = any(v_evidence_ids);

  if v_state = 'single_source' and v_independent_source_count <> 1 then
    raise exception 'single_source_count_must_equal_one';
  end if;
  if v_state in ('independently_supported', 'verified_for_routing')
     and (v_independent_source_count < 2 or v_source_class_count < 2) then
    raise exception 'independent_corroboration_requires_two_sources_and_classes';
  end if;
  if v_state = 'verified_for_routing' and v_contradiction_count > 0 then
    raise exception 'routing_verification_cannot_ignore_contradictions';
  end if;
  if v_state = 'contradicted' and v_contradiction_count < 1 then
    raise exception 'contradicted_assessment_requires_contradiction';
  end if;
  if v_state = 'verified_for_routing' and not exists (
    select 1
    from private.integrity_pattern_candidate c
    join public.live_data_signals s on s.live_data_signal_id = c.signal_id
    where c.candidate_id = v_candidate and s.is_current
  ) then
    raise exception 'stale_atlas_candidate_cannot_be_verified_for_routing';
  end if;

  v_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id', v_candidate,
    'assessment_state', v_state,
    'independent_source_count', v_independent_source_count,
    'contradiction_count', v_contradiction_count,
    'source_class_count', v_source_class_count,
    'rationale', p_record->>'rationale',
    'evidence_link_ids', to_jsonb(v_evidence_ids),
    'rule_id', p_record->>'rule_id',
    'rule_version', p_record->>'rule_version',
    'assessed_by_type', coalesce(nullif(p_record->>'assessed_by_type',''), 'reviewer'),
    'assessed_by_id', nullif(p_record->>'assessed_by_id','')
  ));

  insert into private.integrity_corroboration_assessment(
    candidate_id,
    assessment_state,
    independent_source_count,
    contradiction_count,
    source_class_count,
    rationale,
    evidence_link_ids,
    rule_id,
    rule_version,
    assessment_hash,
    assessed_by_type,
    assessed_by_id
  )
  select
    v_candidate,
    v_state,
    v_independent_source_count,
    v_contradiction_count,
    v_source_class_count,
    p_record->>'rationale',
    v_evidence_ids,
    p_record->>'rule_id',
    p_record->>'rule_version',
    v_hash,
    coalesce(nullif(p_record->>'assessed_by_type',''), 'reviewer'),
    nullif(p_record->>'assessed_by_id','')
  on conflict (assessment_hash) do nothing
  returning assessment_id into v_id;

  if v_id is null then
    select assessment_id
    into v_id
    from private.integrity_corroboration_assessment
    where assessment_hash = v_hash;
  end if;
  return v_id;
end;
$$;

create or replace function public.transition_integrity_candidate_v1(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_id uuid;
  v_hash text;
  v_candidate uuid := (p_record->>'candidate_id')::uuid;
  v_from text;
  v_to text := p_record->>'to_status';
  v_assessment uuid := nullif(p_record->>'assessment_id','')::uuid;
begin
  select coalesce(
    (
      select t.to_status
      from private.integrity_candidate_transition t
      where t.candidate_id = v_candidate
      order by t.transition_order desc
      limit 1
    ),
    c.status
  )
  into v_from
  from private.integrity_pattern_candidate c
  where c.candidate_id = v_candidate;

  if v_from is null then
    raise exception 'candidate does not exist';
  end if;
  if v_to = 'escalated' then
    raise exception 'integrity_transmission_not_supported';
  end if;
  if v_assessment is not null and not exists (
    select 1
    from private.integrity_corroboration_assessment a
    where a.assessment_id = v_assessment and a.candidate_id = v_candidate
  ) then
    raise exception 'assessment does not belong to candidate';
  end if;
  if v_to = 'escalation_ready' and not exists (
    select 1
    from private.integrity_corroboration_assessment a
    join private.integrity_pattern_candidate c on c.candidate_id = a.candidate_id
    join public.live_data_signals s on s.live_data_signal_id = c.signal_id
    where a.assessment_id = v_assessment
      and a.candidate_id = v_candidate
      and a.assessment_state = 'verified_for_routing'
      and a.assessment_order = (
        select max(latest.assessment_order)
        from private.integrity_corroboration_assessment latest
        where latest.candidate_id = a.candidate_id
      )
      and s.is_current
  ) then
    raise exception 'latest verified current assessment required';
  end if;
  if not (case v_from
    when 'candidate' then v_to in ('evidence_gathering','review_hold','dismissed')
    when 'evidence_gathering' then v_to in ('corroboration_review','review_hold','dismissed')
    when 'corroboration_review' then v_to in ('corroborated','contradicted','inconclusive','review_hold')
    when 'corroborated' then v_to in ('routing_review','review_hold')
    when 'routing_review' then v_to in ('escalation_ready','review_hold','inconclusive')
    when 'escalation_ready' then v_to = 'review_hold'
    when 'review_hold' then v_to in ('evidence_gathering','corroboration_review','routing_review','dismissed')
    when 'contradicted' then v_to in ('review_hold','closed')
    when 'inconclusive' then v_to in ('evidence_gathering','closed')
    when 'dismissed' then v_to = 'closed'
    else false
  end) then
    raise exception 'invalid integrity candidate transition: % -> %', v_from, v_to;
  end if;

  v_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id', v_candidate,
    'from_status', v_from,
    'to_status', v_to,
    'reason', p_record->>'reason',
    'actor_type', p_record->>'actor_type',
    'actor_id', p_record->>'actor_id',
    'assessment_id', v_assessment
  ));
  insert into private.integrity_candidate_transition(
    candidate_id,
    from_status,
    to_status,
    reason,
    actor_type,
    actor_id,
    assessment_id,
    transition_hash
  ) values (
    v_candidate,
    v_from,
    v_to,
    p_record->>'reason',
    p_record->>'actor_type',
    nullif(p_record->>'actor_id',''),
    v_assessment,
    v_hash
  )
  on conflict (transition_hash) do nothing
  returning transition_id into v_id;

  if v_id is null then
    select transition_id
    into v_id
    from private.integrity_candidate_transition
    where transition_hash = v_hash;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_integrity_escalation_packet_v1(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_candidate uuid := (p_record->>'candidate_id')::uuid;
  v_assessment uuid := (p_record->>'assessment_id')::uuid;
  v_route uuid;
  v_packet uuid;
  v_routing_hash text;
  v_packet_hash text;
  v_evidence_ids uuid[];
begin
  if not exists (
    select 1
    from private.integrity_corroboration_assessment a
    join private.integrity_pattern_candidate c on c.candidate_id = a.candidate_id
    join public.live_data_signals s on s.live_data_signal_id = c.signal_id
    where a.assessment_id = v_assessment
      and a.candidate_id = v_candidate
      and a.assessment_state = 'verified_for_routing'
      and a.assessment_order = (
        select max(latest.assessment_order)
        from private.integrity_corroboration_assessment latest
        where latest.candidate_id = a.candidate_id
      )
      and s.is_current
  ) then
    raise exception 'latest verified current assessment belonging to candidate is required';
  end if;
  if coalesce(
    (
      select t.to_status
      from private.integrity_candidate_transition t
      where t.candidate_id = v_candidate
      order by t.transition_order desc
      limit 1
    ),
    (select c.status from private.integrity_pattern_candidate c where c.candidate_id = v_candidate)
  ) <> 'escalation_ready' then
    raise exception 'candidate must be in escalation_ready state';
  end if;
  if jsonb_typeof(p_record->'routing') is distinct from 'object'
     or jsonb_typeof(p_record->'evidence_link_ids') is distinct from 'array'
     or jsonb_typeof(p_record->'packet_payload') is distinct from 'object' then
    raise exception 'routing, evidence_link_ids, and packet_payload are required';
  end if;
  if p_record#>'{packet_payload,transmission_authorized}' is distinct from 'false'::jsonb
     or p_record#>'{routing,routing_constraints,draft_only}' is distinct from 'true'::jsonb
     or p_record#>'{routing,routing_constraints,transmission_authorized}' is distinct from 'false'::jsonb
     or p_record#>'{routing,routing_constraints,human_review_required}' is distinct from 'true'::jsonb then
    raise exception 'integrity packet must remain draft-only and human-reviewed';
  end if;

  select coalesce(array_agg(evidence_id order by evidence_id), array[]::uuid[])
  into v_evidence_ids
  from (
    select distinct value::uuid as evidence_id
    from jsonb_array_elements_text(p_record->'evidence_link_ids')
  ) selected;
  if cardinality(v_evidence_ids) = 0 or exists (
    select 1 from unnest(v_evidence_ids) as selected(evidence_id)
    where not exists (
      select 1
      from private.integrity_evidence_link e
      where e.evidence_link_id = selected.evidence_id and e.candidate_id = v_candidate
    )
  ) then
    raise exception 'packet evidence must be nonempty and belong to candidate';
  end if;

  v_routing_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id', v_candidate,
    'assessment_id', v_assessment,
    'routing', p_record->'routing'
  ));
  insert into private.integrity_routing_snapshot(
    candidate_id,
    assessment_id,
    jurisdiction_id,
    agency_name,
    department_name,
    channel_type,
    destination_uri,
    authority_basis,
    routing_constraints,
    source_as_of,
    routing_hash
  ) values (
    v_candidate,
    v_assessment,
    p_record#>>'{routing,jurisdiction_id}',
    p_record#>>'{routing,agency_name}',
    nullif(p_record#>>'{routing,department_name}',''),
    p_record#>>'{routing,channel_type}',
    nullif(p_record#>>'{routing,destination_uri}',''),
    p_record#>'{routing,authority_basis}',
    p_record#>'{routing,routing_constraints}',
    (p_record#>>'{routing,source_as_of}')::timestamptz,
    v_routing_hash
  )
  on conflict (routing_hash) do nothing
  returning routing_snapshot_id into v_route;

  if v_route is null then
    select routing_snapshot_id
    into v_route
    from private.integrity_routing_snapshot
    where routing_hash = v_routing_hash;
  end if;

  v_packet_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id', v_candidate,
    'assessment_id', v_assessment,
    'routing_snapshot_id', v_route,
    'evidence_link_ids', to_jsonb(v_evidence_ids),
    'packet_payload', p_record->'packet_payload'
  ));
  insert into private.integrity_escalation_packet(
    candidate_id,
    assessment_id,
    routing_snapshot_id,
    evidence_link_ids,
    packet_payload,
    packet_hash,
    created_by_type,
    created_by_id
  ) values (
    v_candidate,
    v_assessment,
    v_route,
    v_evidence_ids,
    p_record->'packet_payload',
    v_packet_hash,
    p_record->>'created_by_type',
    nullif(p_record->>'created_by_id','')
  )
  on conflict (packet_hash) do nothing
  returning packet_id into v_packet;

  if v_packet is null then
    select packet_id
    into v_packet
    from private.integrity_escalation_packet
    where packet_hash = v_packet_hash;
  end if;
  return v_packet;
end;
$$;

create or replace function private.integrity_source_class_from_atlas_v1(p_source_class text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case
    when lower(coalesce(p_source_class, '')) in (
      'campaign_finance', 'campaign-finance', 'campaign_finance_record', 'fec'
    ) then 'campaign_finance_record'
    when lower(coalesce(p_source_class, '')) in (
      'lobbying', 'lobbying_disclosure', 'senate_lda'
    ) then 'lobbying_disclosure'
    when lower(coalesce(p_source_class, '')) in (
      'foreign_influence', 'foreign_agent_registration', 'fara'
    ) then 'foreign_agent_registration'
    when lower(coalesce(p_source_class, '')) like '%legis%'
      or lower(coalesce(p_source_class, '')) in ('open_states', 'civic_genome')
      then 'legislative_record'
    when lower(coalesce(p_source_class, '')) like '%court%'
      then 'court_record'
    when lower(coalesce(p_source_class, '')) like '%procure%'
      or lower(coalesce(p_source_class, '')) like '%contract%'
      then 'procurement_record'
    when lower(coalesce(p_source_class, '')) like '%corporat%'
      or lower(coalesce(p_source_class, '')) like '%registry%'
      or lower(coalesce(p_source_class, '')) like '%license%'
      then 'corporate_record'
    when lower(coalesce(p_source_class, '')) like '%enforcement%'
      or lower(coalesce(p_source_class, '')) like '%regulat%'
      then 'regulatory_record'
    when lower(coalesce(p_source_class, '')) in (
      'official_primary', 'official_secondary', 'audited_financial_record',
      'journalistic_source', 'user_supplied'
    ) then lower(p_source_class)
    else 'other'
  end;
$$;

create or replace function public.project_atlas_integrity_candidate_v1(p_signal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_signal public.live_data_signals%rowtype;
  v_candidate_type text;
  v_candidate_id uuid;
  v_evidence_id uuid;
  v_evidence_ids uuid[] := array[]::uuid[];
  v_ref jsonb;
  v_source_hash text;
  v_source_id text;
begin
  select *
  into v_signal
  from public.live_data_signals
  where live_data_signal_id = p_signal_id;

  if not found then
    raise exception 'Atlas Domain 3 record does not exist: %', p_signal_id;
  end if;

  if not v_signal.is_current
     or v_signal.governance_status <> 'observation_candidate'
     or v_signal.detection_rule_id not like 'atlas.domain3.integrity.%' then
    return jsonb_build_object(
      'projected', false,
      'signal_id', p_signal_id,
      'reason', 'not_a_current_atlas_integrity_observation_candidate'
    );
  end if;

  v_candidate_type := case v_signal.signal_type
    when 'phoenix_continuity_candidate' then 'phoenix_successor_pattern'
    when 'exact_identifier_reuse_candidate' then 'exact_identifier_reuse_pattern'
    when 'financial_conduit_candidate' then 'financial_conduit_pattern'
    when 'legislative_financial_convergence_candidate' then 'legislative_integrity_anomaly'
    when 'source_contradiction_candidate' then 'contradiction_pattern'
    when 'numeric_range_anomaly_candidate' then 'numeric_range_anomaly'
    else null
  end;

  if v_candidate_type is null then
    raise exception 'Unsupported Atlas integrity signal type: %', v_signal.signal_type;
  end if;

  if jsonb_typeof(v_signal.evidence_refs) is distinct from 'array'
     or jsonb_array_length(v_signal.evidence_refs) = 0 then
    raise exception 'Atlas integrity candidate requires at least one evidence reference';
  end if;

  v_candidate_id := public.register_integrity_pattern_candidate_v1(
    jsonb_strip_nulls(jsonb_build_object(
      'signal_id', v_signal.live_data_signal_id,
      'candidate_type', v_candidate_type,
      'subject_scope', jsonb_strip_nulls(jsonb_build_object(
        'atlas_candidate_id', v_signal.atlas_candidate_id,
        'atlas_candidate_hash', v_signal.atlas_candidate_hash,
        'atlas_semantic_key', v_signal.atlas_semantic_key,
        'atlas_signal_type', v_signal.signal_type,
        'atlas_description', v_signal.description,
        'primary_stream_id', v_signal.primary_stream_id,
        'source_event_refs', v_signal.source_event_refs,
        'entity_ids', to_jsonb(v_signal.entity_ids),
        'entity_resolution_status', v_signal.entity_resolution_status,
        'severity', v_signal.severity,
        'confidence_score', v_signal.confidence_score,
        'verification_state', v_signal.verification_state,
        'governance_status', v_signal.governance_status,
        'supporting_statistics', v_signal.supporting_statistics,
        'source_freshness_at', v_signal.source_freshness_at
      )),
      'jurisdiction_id', nullif(v_signal.jurisdiction_id, 'unknown'),
      'summary', v_signal.title,
      'rule_id', v_signal.detection_rule_id,
      'rule_version', v_signal.detection_rule_version,
      'observed_at', v_signal.detected_at
    ))
  );

  for v_ref in
    select value
    from jsonb_array_elements(v_signal.evidence_refs)
  loop
    v_source_hash := lower(coalesce(v_ref->>'event_identity_hash', ''));
    if v_source_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'Atlas evidence reference is missing its event SHA-256';
    end if;

    v_source_id := coalesce(
      nullif(v_ref->>'source_id', ''),
      nullif(v_ref->>'stream_id', ''),
      'unknown_source'
    );

    v_evidence_id := public.attach_integrity_candidate_evidence_v1(
      jsonb_strip_nulls(jsonb_build_object(
        'candidate_id', v_candidate_id,
        'source_class', private.integrity_source_class_from_atlas_v1(v_ref->>'source_class'),
        'source_relation', 'atlas.signal_events/' || v_source_id,
        'source_record_key', coalesce(
          nullif(v_ref->>'source_record_key', ''),
          coalesce(v_ref->>'stream_id', 'unknown_stream') || ':' || coalesce(v_ref->>'offset', 'unknown_offset')
        ),
        'source_uri', nullif(v_ref->>'source_uri', ''),
        'quote_text', nullif(v_ref->>'quote_text', ''),
        'pinpoint', coalesce(
          nullif(v_ref->>'pinpoint', ''),
          coalesce(v_ref->>'stream_id', 'unknown_stream') || ':offset:' || coalesce(v_ref->>'offset', 'unknown')
        ),
        'source_content_hash', v_source_hash,
        'supports_or_contradicts', 'supports',
        'observed_at', nullif(v_ref->>'observed_at', '')
      ))
    );
    v_evidence_ids := array_append(v_evidence_ids, v_evidence_id);
  end loop;

  return jsonb_build_object(
    'projected', true,
    'signal_id', p_signal_id,
    'candidate_id', v_candidate_id,
    'candidate_type', v_candidate_type,
    'evidence_link_ids', to_jsonb(v_evidence_ids),
    'evidence_count', cardinality(v_evidence_ids)
  );
end;
$$;

create or replace function public.project_atlas_integrity_candidates_v1(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_signal_id uuid;
  v_result jsonb;
  v_projected integer := 0;
  v_candidate_ids uuid[] := array[]::uuid[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000';
  end if;

  for v_signal_id in
    select s.live_data_signal_id
    from public.live_data_signals s
    where s.is_current
      and s.governance_status = 'observation_candidate'
      and s.detection_rule_id like 'atlas.domain3.integrity.%'
      and not exists (
        select 1
        from private.integrity_pattern_candidate c
        where c.signal_id = s.live_data_signal_id
      )
    order by s.detected_at, s.live_data_signal_id
    limit p_limit
  loop
    v_result := public.project_atlas_integrity_candidate_v1(v_signal_id);
    if coalesce((v_result->>'projected')::boolean, false) then
      v_projected := v_projected + 1;
      v_candidate_ids := array_append(v_candidate_ids, (v_result->>'candidate_id')::uuid);
    end if;
  end loop;

  return jsonb_build_object(
    'projected_count', v_projected,
    'candidate_ids', to_jsonb(v_candidate_ids),
    'limit', p_limit
  );
end;
$$;

create or replace function private.project_atlas_integrity_candidate_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
begin
  if new.is_current
     and new.governance_status = 'observation_candidate'
     and new.detection_rule_id like 'atlas.domain3.integrity.%' then
    perform public.project_atlas_integrity_candidate_v1(new.live_data_signal_id);
  end if;
  return new;
end;
$$;

drop trigger if exists project_atlas_integrity_candidate_v1 on public.live_data_signals;
create trigger project_atlas_integrity_candidate_v1
after insert or update of is_current, governance_status on public.live_data_signals
for each row execute function private.project_atlas_integrity_candidate_trigger_v1();

create or replace function public.integrity_candidate_review_v2(p_candidate_id uuid default null)
returns table(
  candidate_id uuid,
  case_id text,
  signal_id uuid,
  candidate_type text,
  jurisdiction_id text,
  summary text,
  status text,
  candidate_hash text,
  observed_at timestamptz,
  created_at timestamptz,
  evidence_count bigint,
  support_count bigint,
  contradiction_count bigint,
  latest_assessment_state text,
  atlas_is_current boolean,
  atlas_governance_status text,
  atlas_verification_state text,
  atlas_candidate_id uuid,
  atlas_candidate_hash text,
  atlas_semantic_key text,
  atlas_confidence_score numeric,
  atlas_severity text
)
language sql
security definer
stable
set search_path to 'pg_catalog', 'private', 'public'
as $$
  select
    c.candidate_id,
    c.case_id,
    c.signal_id,
    c.candidate_type,
    c.jurisdiction_id,
    c.summary,
    coalesce(
      (
        select t.to_status
        from private.integrity_candidate_transition t
        where t.candidate_id = c.candidate_id
        order by t.transition_order desc
        limit 1
      ),
      c.status
    ),
    c.candidate_hash,
    c.observed_at,
    c.created_at,
    count(e.*),
    count(e.*) filter (where e.supports_or_contradicts = 'supports'),
    count(e.*) filter (where e.supports_or_contradicts = 'contradicts'),
    (
      select a.assessment_state
      from private.integrity_corroboration_assessment a
      where a.candidate_id = c.candidate_id
      order by a.assessment_order desc
      limit 1
    ),
    s.is_current,
    s.governance_status,
    s.verification_state,
    s.atlas_candidate_id,
    s.atlas_candidate_hash,
    s.atlas_semantic_key,
    s.confidence_score,
    s.severity
  from private.integrity_pattern_candidate c
  join public.live_data_signals s on s.live_data_signal_id = c.signal_id
  left join private.integrity_evidence_link e on e.candidate_id = c.candidate_id
  where c.is_current and (p_candidate_id is null or c.candidate_id = p_candidate_id)
  group by c.candidate_id, s.live_data_signal_id;
$$;

create or replace function public.integrity_projection_readiness_v1()
returns jsonb
language sql
security definer
stable
set search_path to 'pg_catalog', 'private', 'public'
as $$
  with eligible as (
    select s.live_data_signal_id
    from public.live_data_signals s
    where s.is_current
      and s.governance_status = 'observation_candidate'
      and s.detection_rule_id like 'atlas.domain3.integrity.%'
  ), projected as (
    select distinct c.signal_id
    from private.integrity_pattern_candidate c
    where c.signal_id is not null
  )
  select jsonb_build_object(
    'atlas_current_integrity_candidate_count', (select count(*) from eligible),
    'projected_review_count', (select count(*) from eligible e join projected p on p.signal_id = e.live_data_signal_id),
    'unprojected_review_count', (select count(*) from eligible e left join projected p on p.signal_id = e.live_data_signal_id where p.signal_id is null),
    'projection_healthy', not exists (
      select 1 from eligible e left join projected p on p.signal_id = e.live_data_signal_id where p.signal_id is null
    ),
    'source_system', 'Atlas Domain 3',
    'interpretation_boundary', 'Candidates are evidence-bound observations for human review, not findings of corruption, illegality, motive, or liability.'
  );
$$;

-- Preserve the existing Atlas runtime counts while separating Domain 3
-- observation candidates from records explicitly promoted by governance.
create or replace view public.v_signal_architecture_integrity
with (security_invoker = true)
as
with atlas_counts as (
  select
    coalesce(sum(p.observation_count), 0)::bigint as raw_observation_count,
    coalesce(sum(p.identity_bound_observation_count), 0)::bigint as unique_observation_count,
    max(p.latest_observed_at) as latest_observation_at
  from public.atlas_stream_runtime_projection_v1 p
  where p.is_current
)
select
  a.raw_observation_count as atlas_raw_observation_count,
  (select count(*) from public.detected_signals)::bigint as legacy_detected_signals_count,
  (select count(*) from public.live_signals)::bigint as legacy_live_signals_count,
  (select count(*) from public.detected_signals_v2)::bigint as prior_v2_signal_count,
  (select count(*) from public.intake_signals where is_current)::bigint as intake_signal_count,
  (select count(*) from public.legal_patterns where is_current)::bigint as legal_pattern_count,
  (select count(*) from public.live_data_signals where is_current)::bigint as live_data_signal_count,
  (select count(*) from public.signal_convergences where is_current)::bigint as convergence_count,
  a.latest_observation_at as latest_atlas_observation_at,
  'legacy_detected_signals_are_unclassified_evidence'::text as legacy_status,
  'current_atlas_runtime_projection_is_operator_observation_truth'::text as atlas_status,
  a.unique_observation_count as atlas_unique_observation_count,
  greatest(a.raw_observation_count - a.unique_observation_count, 0::bigint) as atlas_replay_observation_count,
  (select count(*) from public.live_data_signals where is_current and governance_status = 'observation_candidate')::bigint
    as live_data_candidate_count,
  (select count(*) from public.live_data_signals where is_current and governance_status = 'promoted')::bigint
    as live_data_promoted_count
from atlas_counts a;

-- Extend the existing detail payload with the immutable Atlas projection state.
create or replace function public.integrity_candidate_detail_v1(p_candidate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
  select jsonb_build_object(
    'candidate', jsonb_build_object(
      'candidate_id', c.candidate_id,
      'case_id', c.case_id,
      'signal_id', c.signal_id,
      'candidate_type', c.candidate_type,
      'subject_scope', c.subject_scope,
      'jurisdiction_id', c.jurisdiction_id,
      'summary', c.summary,
      'status', coalesce(
        (
          select t.to_status
          from private.integrity_candidate_transition t
          where t.candidate_id = c.candidate_id
          order by t.transition_order desc
          limit 1
        ),
        c.status
      ),
      'rule_id', c.rule_id,
      'rule_version', c.rule_version,
      'input_hash', c.input_hash,
      'candidate_hash', c.candidate_hash,
      'observed_at', c.observed_at,
      'created_at', c.created_at
    ),
    'atlas_projection', jsonb_build_object(
      'is_current', s.is_current,
      'governance_status', s.governance_status,
      'verification_state', s.verification_state,
      'atlas_candidate_id', s.atlas_candidate_id,
      'atlas_candidate_hash', s.atlas_candidate_hash,
      'atlas_semantic_key', s.atlas_semantic_key,
      'signal_type', s.signal_type,
      'title', s.title,
      'description', s.description,
      'primary_stream_id', s.primary_stream_id,
      'entity_ids', to_jsonb(s.entity_ids),
      'entity_resolution_status', s.entity_resolution_status,
      'severity', s.severity,
      'confidence_score', s.confidence_score,
      'supporting_statistics', s.supporting_statistics,
      'source_event_refs', s.source_event_refs,
      'source_freshness_at', s.source_freshness_at,
      'detected_at', s.detected_at
    ),
    'evidence', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'evidence_link_id', e.evidence_link_id,
            'source_class', e.source_class,
            'source_relation', e.source_relation,
            'source_record_key', e.source_record_key,
            'source_uri', e.source_uri,
            'quote_text', e.quote_text,
            'pinpoint', e.pinpoint,
            'source_content_hash', e.source_content_hash,
            'supports_or_contradicts', e.supports_or_contradicts,
            'evidence_hash', e.evidence_hash,
            'provenance_type', e.provenance_type,
            'created_by_id', e.created_by_id,
            'observed_at', e.observed_at,
            'created_at', e.created_at
          ) order by e.created_at, e.evidence_link_id
        )
        from private.integrity_evidence_link e
        where e.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'assessments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assessment_id', a.assessment_id,
            'assessment_order', a.assessment_order,
            'assessment_state', a.assessment_state,
            'independent_source_count', a.independent_source_count,
            'contradiction_count', a.contradiction_count,
            'source_class_count', a.source_class_count,
            'rationale', a.rationale,
            'evidence_link_ids', a.evidence_link_ids,
            'rule_id', a.rule_id,
            'rule_version', a.rule_version,
            'assessment_hash', a.assessment_hash,
            'assessed_by_type', a.assessed_by_type,
            'assessed_by_id', a.assessed_by_id,
            'assessed_at', a.assessed_at
          ) order by a.assessment_order
        )
        from private.integrity_corroboration_assessment a
        where a.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'transitions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'transition_id', t.transition_id,
            'transition_order', t.transition_order,
            'from_status', t.from_status,
            'to_status', t.to_status,
            'reason', t.reason,
            'actor_type', t.actor_type,
            'actor_id', t.actor_id,
            'assessment_id', t.assessment_id,
            'transition_hash', t.transition_hash,
            'created_at', t.created_at
          ) order by t.transition_order
        )
        from private.integrity_candidate_transition t
        where t.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'routing_snapshots', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'routing_snapshot_id', r.routing_snapshot_id,
            'assessment_id', r.assessment_id,
            'jurisdiction_id', r.jurisdiction_id,
            'agency_name', r.agency_name,
            'department_name', r.department_name,
            'channel_type', r.channel_type,
            'destination_uri', r.destination_uri,
            'authority_basis', r.authority_basis,
            'routing_constraints', r.routing_constraints,
            'source_as_of', r.source_as_of,
            'routing_hash', r.routing_hash,
            'created_at', r.created_at
          ) order by r.created_at, r.routing_snapshot_id
        )
        from private.integrity_routing_snapshot r
        where r.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'packets', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'packet_id', p.packet_id,
            'assessment_id', p.assessment_id,
            'routing_snapshot_id', p.routing_snapshot_id,
            'packet_state', p.packet_state,
            'allegation_disclaimer', p.allegation_disclaimer,
            'evidence_link_ids', p.evidence_link_ids,
            'packet_payload', p.packet_payload,
            'packet_hash', p.packet_hash,
            'created_by_type', p.created_by_type,
            'created_by_id', p.created_by_id,
            'created_at', p.created_at,
            'transmitted_at', p.transmitted_at,
            'external_receipt', p.external_receipt
          ) order by p.created_at, p.packet_id
        )
        from private.integrity_escalation_packet p
        where p.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'disclaimer', 'Atlas Domain 3 integrity candidates are evidence-bound review objects. They do not determine corruption, criminal liability, intent, or wrongdoing.'
  )
  from private.integrity_pattern_candidate c
  join public.live_data_signals s on s.live_data_signal_id = c.signal_id
  where c.candidate_id = p_candidate_id and c.is_current;
$$;

revoke all on function private.integrity_source_class_from_atlas_v1(text)
  from public, anon, authenticated;
revoke all on function private.project_atlas_integrity_candidate_trigger_v1()
  from public, anon, authenticated;
revoke all on function public.project_atlas_integrity_candidate_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.project_atlas_integrity_candidates_v1(integer)
  from public, anon, authenticated;
revoke all on function public.integrity_candidate_review_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.integrity_projection_readiness_v1()
  from public, anon, authenticated;
revoke all on function public.integrity_candidate_detail_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.attach_integrity_candidate_evidence_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_integrity_corroboration_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.transition_integrity_candidate_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.create_integrity_escalation_packet_v1(jsonb)
  from public, anon, authenticated;

grant execute on function public.project_atlas_integrity_candidate_v1(uuid)
  to service_role;
grant execute on function public.project_atlas_integrity_candidates_v1(integer)
  to service_role;
grant execute on function public.integrity_candidate_review_v2(uuid)
  to service_role;
grant execute on function public.integrity_projection_readiness_v1()
  to service_role;
grant execute on function public.integrity_candidate_detail_v1(uuid)
  to service_role;
grant execute on function public.attach_integrity_candidate_evidence_v1(jsonb)
  to service_role;
grant execute on function public.record_integrity_corroboration_v1(jsonb)
  to service_role;
grant execute on function public.transition_integrity_candidate_v1(jsonb)
  to service_role;
grant execute on function public.create_integrity_escalation_packet_v1(jsonb)
  to service_role;

comment on function public.project_atlas_integrity_candidate_v1(uuid) is
  'Projects one current Atlas Domain 3 integrity observation candidate into Lighthouse review storage without re-detection or promotion.';
comment on function public.project_atlas_integrity_candidates_v1(integer) is
  'Service-only reconciliation for current Atlas Domain 3 integrity candidates not yet represented in Lighthouse review storage.';
comment on function public.integrity_projection_readiness_v1() is
  'Reports only Atlas-to-Lighthouse integrity review projection health; Atlas owns detector and source readiness.';

-- Reconcile any Atlas candidates that arrived before this projection contract.
select public.project_atlas_integrity_candidates_v1(1000);
