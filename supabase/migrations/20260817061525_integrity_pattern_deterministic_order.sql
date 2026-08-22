-- Replace timestamp/UUID recency with monotonic per-table order. PostgreSQL
-- now() is transaction-stable, so several valid lifecycle transitions written
-- in one transaction otherwise share a timestamp and sort by random UUID.

alter table private.integrity_corroboration_assessment
  add column if not exists assessment_order bigint generated always as identity;

alter table private.integrity_candidate_transition
  add column if not exists transition_order bigint generated always as identity;

drop index if exists private.integrity_assessment_candidate_v1;
create index integrity_assessment_candidate_v1
  on private.integrity_corroboration_assessment(candidate_id, assessment_order desc);

drop index if exists private.integrity_transition_candidate_v1;
create index integrity_transition_candidate_v1
  on private.integrity_candidate_transition(candidate_id, transition_order desc);

create or replace function public.transition_integrity_candidate_v1(p_record jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_id uuid; v_hash text; v_candidate uuid := (p_record->>'candidate_id')::uuid;
  v_from text; v_to text := p_record->>'to_status'; v_assessment uuid;
begin
  select coalesce(
    (select t.to_status from private.integrity_candidate_transition t
      where t.candidate_id=v_candidate order by t.transition_order desc limit 1),
    c.status
  ) into v_from from private.integrity_pattern_candidate c where c.candidate_id=v_candidate;
  if v_from is null then raise exception 'candidate does not exist'; end if;
  v_assessment := nullif(p_record->>'assessment_id','')::uuid;
  if v_assessment is not null and not exists (
    select 1 from private.integrity_corroboration_assessment a
    where a.assessment_id=v_assessment and a.candidate_id=v_candidate
  ) then raise exception 'assessment does not belong to candidate'; end if;
  if not (case v_from
    when 'candidate' then v_to in ('evidence_gathering','review_hold','dismissed')
    when 'evidence_gathering' then v_to in ('corroboration_review','review_hold','dismissed')
    when 'corroboration_review' then v_to in ('corroborated','contradicted','inconclusive','review_hold')
    when 'corroborated' then v_to in ('routing_review','review_hold')
    when 'routing_review' then v_to in ('escalation_ready','review_hold','inconclusive')
    when 'escalation_ready' then v_to in ('escalated','review_hold')
    when 'escalated' then v_to in ('closed','review_hold')
    when 'review_hold' then v_to in ('evidence_gathering','corroboration_review','routing_review','dismissed')
    when 'contradicted' then v_to in ('review_hold','closed')
    when 'inconclusive' then v_to in ('evidence_gathering','closed')
    when 'dismissed' then v_to='closed'
    else false end)
  then raise exception 'invalid integrity candidate transition: % -> %',v_from,v_to; end if;
  v_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id',v_candidate,'from_status',v_from,'to_status',v_to,
    'reason',p_record->>'reason','actor_type',p_record->>'actor_type',
    'actor_id',p_record->>'actor_id','assessment_id',v_assessment
  ));
  insert into private.integrity_candidate_transition(
    candidate_id,from_status,to_status,reason,actor_type,actor_id,assessment_id,transition_hash
  ) values (v_candidate,v_from,v_to,p_record->>'reason',p_record->>'actor_type',
    nullif(p_record->>'actor_id',''),v_assessment,v_hash)
  on conflict (transition_hash) do nothing returning transition_id into v_id;
  if v_id is null then select transition_id into v_id from private.integrity_candidate_transition where transition_hash=v_hash; end if;
  return v_id;
end $$;

create or replace function public.create_integrity_escalation_packet_v1(p_record jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare
  v_candidate uuid := (p_record->>'candidate_id')::uuid;
  v_assessment uuid := (p_record->>'assessment_id')::uuid;
  v_route uuid; v_packet uuid; v_routing_hash text; v_packet_hash text;
  v_evidence_ids uuid[];
begin
  if not exists (
    select 1 from private.integrity_corroboration_assessment a
    where a.assessment_id=v_assessment and a.candidate_id=v_candidate
      and a.assessment_state='verified_for_routing'
  ) then raise exception 'a verified_for_routing assessment belonging to candidate is required'; end if;
  if coalesce(
    (select t.to_status from private.integrity_candidate_transition t
      where t.candidate_id=v_candidate order by t.transition_order desc limit 1),
    (select c.status from private.integrity_pattern_candidate c where c.candidate_id=v_candidate)
  ) <> 'escalation_ready' then
    raise exception 'candidate must be in escalation_ready state';
  end if;
  if jsonb_typeof(p_record->'routing') is distinct from 'object'
     or jsonb_typeof(p_record->'evidence_link_ids') is distinct from 'array'
     or jsonb_typeof(p_record->'packet_payload') is distinct from 'object' then
    raise exception 'routing, evidence_link_ids, and packet_payload are required';
  end if;
  select array_agg(value::uuid order by value) into v_evidence_ids
  from jsonb_array_elements_text(p_record->'evidence_link_ids');
  if cardinality(v_evidence_ids)=0 or exists (
    select 1 from unnest(v_evidence_ids) x
    where not exists (select 1 from private.integrity_evidence_link e where e.evidence_link_id=x and e.candidate_id=v_candidate)
  ) then raise exception 'packet evidence must be nonempty and belong to candidate'; end if;
  v_routing_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id',v_candidate,'assessment_id',v_assessment,'routing',p_record->'routing'
  ));
  insert into private.integrity_routing_snapshot(
    candidate_id,assessment_id,jurisdiction_id,agency_name,department_name,channel_type,
    destination_uri,authority_basis,routing_constraints,source_as_of,routing_hash
  ) values (
    v_candidate,v_assessment,p_record#>>'{routing,jurisdiction_id}',p_record#>>'{routing,agency_name}',
    nullif(p_record#>>'{routing,department_name}',''),p_record#>>'{routing,channel_type}',
    nullif(p_record#>>'{routing,destination_uri}',''),p_record#>'{routing,authority_basis}',
    coalesce(p_record#>'{routing,routing_constraints}','{}'::jsonb),
    (p_record#>>'{routing,source_as_of}')::timestamptz,v_routing_hash
  ) on conflict (routing_hash) do nothing returning routing_snapshot_id into v_route;
  if v_route is null then select routing_snapshot_id into v_route from private.integrity_routing_snapshot where routing_hash=v_routing_hash; end if;
  v_packet_hash := private.integrity_sha256_v1(jsonb_build_object(
    'candidate_id',v_candidate,'assessment_id',v_assessment,'routing_snapshot_id',v_route,
    'evidence_link_ids',to_jsonb(v_evidence_ids),'packet_payload',p_record->'packet_payload'
  ));
  insert into private.integrity_escalation_packet(
    candidate_id,assessment_id,routing_snapshot_id,evidence_link_ids,packet_payload,
    packet_hash,created_by_type,created_by_id
  ) values (v_candidate,v_assessment,v_route,v_evidence_ids,p_record->'packet_payload',
    v_packet_hash,p_record->>'created_by_type',nullif(p_record->>'created_by_id',''))
  on conflict (packet_hash) do nothing returning packet_id into v_packet;
  if v_packet is null then select packet_id into v_packet from private.integrity_escalation_packet where packet_hash=v_packet_hash; end if;
  return v_packet;
end $$;

create or replace function public.integrity_candidate_review_v1(p_candidate_id uuid default null)
returns table(candidate_id uuid, case_id text, signal_id uuid, candidate_type text, jurisdiction_id text,
  summary text, status text, candidate_hash text, observed_at timestamptz, created_at timestamptz,
  support_count bigint, contradiction_count bigint, latest_assessment_state text)
language sql security definer stable
set search_path to 'pg_catalog', 'private', 'public'
as $$
  select c.candidate_id,c.case_id,c.signal_id,c.candidate_type,c.jurisdiction_id,c.summary,
    coalesce((select t.to_status from private.integrity_candidate_transition t
      where t.candidate_id=c.candidate_id order by t.transition_order desc limit 1),c.status),
    c.candidate_hash,c.observed_at,c.created_at,
    count(e.*) filter(where e.supports_or_contradicts='supports'),
    count(e.*) filter(where e.supports_or_contradicts='contradicts'),
    (select a.assessment_state from private.integrity_corroboration_assessment a
      where a.candidate_id=c.candidate_id order by a.assessment_order desc limit 1)
  from private.integrity_pattern_candidate c
  left join private.integrity_evidence_link e on e.candidate_id=c.candidate_id
  where c.is_current and (p_candidate_id is null or c.candidate_id=p_candidate_id)
  group by c.candidate_id;
$$;

revoke all on function public.transition_integrity_candidate_v1(jsonb) from public, anon, authenticated;
revoke all on function public.create_integrity_escalation_packet_v1(jsonb) from public, anon, authenticated;
revoke all on function public.integrity_candidate_review_v1(uuid) from public, anon, authenticated;
grant execute on function public.transition_integrity_candidate_v1(jsonb) to service_role;
grant execute on function public.create_integrity_escalation_packet_v1(jsonb) to service_role;
grant execute on function public.integrity_candidate_review_v1(uuid) to service_role;
