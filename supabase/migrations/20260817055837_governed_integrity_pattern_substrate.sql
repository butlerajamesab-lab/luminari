-- Governed integrity-pattern substrate.
-- Candidates are reviewable observations, never findings of corruption or wrongdoing.
-- Legacy live_signals/detected_signals remain untouched historical stores. New candidates
-- bind only to canonical public.live_data_signals (the Atlas -> Lighthouse receipt path).

create schema if not exists private;

create table if not exists private.integrity_pattern_candidate (
  candidate_id uuid primary key default gen_random_uuid(),
  case_id text,
  signal_id uuid references public.live_data_signals(live_data_signal_id),
  candidate_type text not null,
  subject_scope jsonb not null default '{}'::jsonb,
  jurisdiction_id text,
  summary text not null,
  status text not null default 'candidate',
  rule_id text not null,
  rule_version text not null,
  input_hash text not null,
  candidate_hash text not null unique,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  supersedes_id uuid references private.integrity_pattern_candidate(candidate_id),
  is_current boolean not null default true,
  constraint integrity_candidate_type_check check (candidate_type in (
    'phoenix_successor_pattern', 'dark_money_pattern',
    'legislative_integrity_anomaly', 'procurement_integrity_anomaly',
    'contradiction_pattern', 'other'
  )),
  constraint integrity_candidate_status_check check (status in (
    'candidate', 'evidence_gathering', 'corroboration_review', 'review_hold',
    'corroborated', 'contradicted', 'inconclusive', 'dismissed',
    'routing_review', 'escalation_ready', 'escalated', 'closed'
  )),
  constraint integrity_candidate_scope_check check (jsonb_typeof(subject_scope) = 'object'),
  constraint integrity_candidate_input_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint integrity_candidate_hash_check check (candidate_hash ~ '^[0-9a-f]{64}$'),
  constraint integrity_candidate_supersession_check check (supersedes_id is null or supersedes_id <> candidate_id)
);

create unique index if not exists integrity_candidate_one_current_semantic_v1
  on private.integrity_pattern_candidate(candidate_type, input_hash)
  where is_current;
create index if not exists integrity_candidate_case_status_v1
  on private.integrity_pattern_candidate(case_id, status, created_at desc);
create index if not exists integrity_candidate_signal_v1
  on private.integrity_pattern_candidate(signal_id) where signal_id is not null;

create table if not exists private.integrity_evidence_link (
  evidence_link_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references private.integrity_pattern_candidate(candidate_id),
  source_class text not null,
  source_relation text not null,
  source_record_key text not null,
  source_uri text,
  quote_text text,
  pinpoint text,
  source_content_hash text not null,
  supports_or_contradicts text not null,
  evidence_hash text not null unique,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint integrity_evidence_source_class_check check (source_class in (
    'official_primary', 'official_secondary', 'court_record', 'legislative_record',
    'campaign_finance_record', 'corporate_record', 'procurement_record',
    'audited_financial_record', 'journalistic_source', 'user_supplied', 'other'
  )),
  constraint integrity_evidence_posture_check check (supports_or_contradicts in (
    'supports', 'contradicts', 'context_only', 'unresolved'
  )),
  constraint integrity_evidence_content_hash_check check (source_content_hash ~ '^[0-9a-f]{64}$'),
  constraint integrity_evidence_hash_check check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint integrity_evidence_locator_check check (
    quote_text is not null or pinpoint is not null or source_uri is not null
  ),
  constraint integrity_evidence_source_unique unique (
    candidate_id, source_relation, source_record_key, source_content_hash, supports_or_contradicts
  )
);
create index if not exists integrity_evidence_candidate_v1
  on private.integrity_evidence_link(candidate_id, created_at);

create table if not exists private.integrity_corroboration_assessment (
  assessment_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references private.integrity_pattern_candidate(candidate_id),
  assessment_state text not null,
  independent_source_count integer not null,
  contradiction_count integer not null default 0,
  source_class_count integer not null,
  rationale text not null,
  evidence_link_ids uuid[] not null,
  rule_id text not null,
  rule_version text not null,
  assessment_hash text not null unique,
  assessed_at timestamptz not null default now(),
  supersedes_id uuid references private.integrity_corroboration_assessment(assessment_id),
  is_current boolean not null default true,
  constraint integrity_assessment_state_check check (assessment_state in (
    'uncorroborated', 'single_source', 'independently_supported',
    'contradicted', 'disputed', 'inconclusive', 'verified_for_routing'
  )),
  constraint integrity_assessment_counts_check check (
    independent_source_count >= 0 and contradiction_count >= 0 and source_class_count >= 0
  ),
  constraint integrity_assessment_evidence_check check (cardinality(evidence_link_ids) > 0),
  constraint integrity_assessment_hash_check check (assessment_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists integrity_assessment_candidate_v1
  on private.integrity_corroboration_assessment(candidate_id, assessed_at desc);

create table if not exists private.integrity_candidate_transition (
  transition_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references private.integrity_pattern_candidate(candidate_id),
  from_status text,
  to_status text not null,
  reason text not null,
  actor_type text not null,
  actor_id text,
  assessment_id uuid references private.integrity_corroboration_assessment(assessment_id),
  transition_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint integrity_transition_actor_check check (actor_type in ('system_rule', 'reviewer', 'administrator')),
  constraint integrity_transition_status_check check (to_status in (
    'candidate', 'evidence_gathering', 'corroboration_review', 'review_hold',
    'corroborated', 'contradicted', 'inconclusive', 'dismissed',
    'routing_review', 'escalation_ready', 'escalated', 'closed'
  )),
  constraint integrity_transition_hash_check check (transition_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists integrity_transition_candidate_v1
  on private.integrity_candidate_transition(candidate_id, created_at);

create table if not exists private.integrity_routing_snapshot (
  routing_snapshot_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references private.integrity_pattern_candidate(candidate_id),
  assessment_id uuid not null references private.integrity_corroboration_assessment(assessment_id),
  jurisdiction_id text not null,
  agency_name text not null,
  department_name text,
  channel_type text not null,
  destination_uri text,
  authority_basis jsonb not null,
  routing_constraints jsonb not null default '{}'::jsonb,
  source_as_of timestamptz not null,
  routing_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint integrity_routing_channel_check check (channel_type in (
    'inspector_general', 'ethics_commission', 'elections_regulator',
    'attorney_general', 'auditor', 'legislative_ethics',
    'law_enforcement', 'administrative_complaint', 'other'
  )),
  constraint integrity_routing_authority_check check (
    jsonb_typeof(authority_basis) = 'object' and authority_basis <> '{}'::jsonb
  ),
  constraint integrity_routing_constraints_check check (jsonb_typeof(routing_constraints) = 'object'),
  constraint integrity_routing_hash_check check (routing_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists private.integrity_escalation_packet (
  packet_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references private.integrity_pattern_candidate(candidate_id),
  assessment_id uuid not null references private.integrity_corroboration_assessment(assessment_id),
  routing_snapshot_id uuid not null references private.integrity_routing_snapshot(routing_snapshot_id),
  packet_state text not null default 'draft',
  allegation_disclaimer text not null default 'This packet contains evidence-bound integrity-pattern candidates for authorized review. It does not determine corruption, criminal liability, or wrongdoing.',
  evidence_link_ids uuid[] not null,
  packet_payload jsonb not null,
  packet_hash text not null unique,
  created_by_type text not null,
  created_by_id text,
  created_at timestamptz not null default now(),
  transmitted_at timestamptz,
  external_receipt text,
  supersedes_id uuid references private.integrity_escalation_packet(packet_id),
  is_current boolean not null default true,
  constraint integrity_packet_state_check check (packet_state in (
    'draft', 'review_hold', 'approved_for_transmission', 'transmitted',
    'acknowledged', 'rejected', 'closed'
  )),
  constraint integrity_packet_evidence_check check (cardinality(evidence_link_ids) > 0),
  constraint integrity_packet_payload_check check (
    jsonb_typeof(packet_payload) = 'object' and packet_payload <> '{}'::jsonb
  ),
  constraint integrity_packet_hash_check check (packet_hash ~ '^[0-9a-f]{64}$'),
  constraint integrity_packet_actor_check check (created_by_type in ('system_rule', 'reviewer', 'administrator'))
);
create index if not exists integrity_packet_candidate_route_v1
  on private.integrity_escalation_packet(candidate_id, routing_snapshot_id, created_at desc);

create or replace function private.integrity_sha256_v1(p_payload jsonb)
returns text language sql immutable strict
set search_path to 'pg_catalog', 'extensions'
as $$ select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex') $$;

create or replace function private.guard_integrity_append_only_v1()
returns trigger language plpgsql
set search_path to 'pg_catalog'
as $$ begin raise exception '% is append-only; % is not permitted', tg_table_name, tg_op; end $$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'integrity_pattern_candidate', 'integrity_evidence_link',
    'integrity_corroboration_assessment', 'integrity_candidate_transition',
    'integrity_routing_snapshot', 'integrity_escalation_packet'
  ] loop
    execute format('drop trigger if exists %I on private.%I', v_table || '_append_only_v1', v_table);
    execute format(
      'create trigger %I before update or delete on private.%I for each row execute function private.guard_integrity_append_only_v1()',
      v_table || '_append_only_v1', v_table
    );
  end loop;
end $$;

create or replace function public.register_integrity_pattern_candidate_v1(p_record jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare v_id uuid; v_input_hash text; v_hash text;
begin
  if coalesce(p_record->>'candidate_type','') = '' or coalesce(p_record->>'summary','') = ''
     or coalesce(p_record->>'rule_id','') = '' or coalesce(p_record->>'rule_version','') = '' then
    raise exception 'candidate_type, summary, rule_id, and rule_version are required';
  end if;
  v_input_hash := private.integrity_sha256_v1(jsonb_build_object(
    'case_id', p_record->>'case_id', 'signal_id', p_record->>'signal_id',
    'candidate_type', p_record->>'candidate_type',
    'subject_scope', coalesce(p_record->'subject_scope','{}'::jsonb),
    'jurisdiction_id', p_record->>'jurisdiction_id',
    'rule_id', p_record->>'rule_id', 'rule_version', p_record->>'rule_version'
  ));
  v_hash := private.integrity_sha256_v1(jsonb_build_object(
    'input_hash', v_input_hash, 'summary', p_record->>'summary',
    'observed_at', p_record->>'observed_at'
  ));
  insert into private.integrity_pattern_candidate(
    case_id, signal_id, candidate_type, subject_scope, jurisdiction_id, summary,
    rule_id, rule_version, input_hash, candidate_hash, observed_at
  ) values (
    nullif(p_record->>'case_id',''), nullif(p_record->>'signal_id','')::uuid,
    p_record->>'candidate_type', coalesce(p_record->'subject_scope','{}'::jsonb),
    nullif(p_record->>'jurisdiction_id',''), p_record->>'summary',
    p_record->>'rule_id', p_record->>'rule_version', v_input_hash, v_hash,
    nullif(p_record->>'observed_at','')::timestamptz
  ) on conflict (candidate_type, input_hash) where is_current do nothing returning candidate_id into v_id;
  if v_id is null then
    select candidate_id into v_id from private.integrity_pattern_candidate
    where candidate_type=p_record->>'candidate_type' and input_hash=v_input_hash and is_current;
  end if;
  return v_id;
end $$;

create or replace function public.attach_integrity_candidate_evidence_v1(p_record jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare v_id uuid; v_hash text;
begin
  if coalesce(p_record->>'candidate_id','') = '' or coalesce(p_record->>'source_class','') = ''
     or coalesce(p_record->>'source_relation','') = '' or coalesce(p_record->>'source_record_key','') = ''
     or coalesce(p_record->>'source_content_hash','') = '' or coalesce(p_record->>'supports_or_contradicts','') = '' then
    raise exception 'candidate, source identity, source hash, and evidence posture are required';
  end if;
  v_hash := private.integrity_sha256_v1(p_record - 'evidence_hash');
  insert into private.integrity_evidence_link(
    candidate_id, source_class, source_relation, source_record_key, source_uri,
    quote_text, pinpoint, source_content_hash, supports_or_contradicts,
    evidence_hash, observed_at
  ) values (
    (p_record->>'candidate_id')::uuid, p_record->>'source_class', p_record->>'source_relation',
    p_record->>'source_record_key', nullif(p_record->>'source_uri',''),
    nullif(p_record->>'quote_text',''), nullif(p_record->>'pinpoint',''),
    p_record->>'source_content_hash', p_record->>'supports_or_contradicts', v_hash,
    nullif(p_record->>'observed_at','')::timestamptz
  ) on conflict (evidence_hash) do nothing returning evidence_link_id into v_id;
  if v_id is null then select evidence_link_id into v_id from private.integrity_evidence_link where evidence_hash=v_hash; end if;
  return v_id;
end $$;

create or replace function public.record_integrity_corroboration_v1(p_record jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
declare v_id uuid; v_hash text; v_candidate uuid := (p_record->>'candidate_id')::uuid;
begin
  if jsonb_typeof(p_record->'evidence_link_ids') is distinct from 'array' then raise exception 'evidence_link_ids must be an array'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_record->'evidence_link_ids') x
    where not exists (select 1 from private.integrity_evidence_link e where e.evidence_link_id=x::uuid and e.candidate_id=v_candidate)
  ) then raise exception 'all evidence links must belong to candidate'; end if;
  v_hash := private.integrity_sha256_v1(p_record - 'assessment_hash');
  insert into private.integrity_corroboration_assessment(
    candidate_id, assessment_state, independent_source_count, contradiction_count,
    source_class_count, rationale, evidence_link_ids, rule_id, rule_version, assessment_hash
  ) select v_candidate, p_record->>'assessment_state', (p_record->>'independent_source_count')::integer,
    coalesce((p_record->>'contradiction_count')::integer,0), (p_record->>'source_class_count')::integer,
    p_record->>'rationale', array(select jsonb_array_elements_text(p_record->'evidence_link_ids')::uuid),
    p_record->>'rule_id', p_record->>'rule_version', v_hash
  on conflict (assessment_hash) do nothing returning assessment_id into v_id;
  if v_id is null then select assessment_id into v_id from private.integrity_corroboration_assessment where assessment_hash=v_hash; end if;
  return v_id;
end $$;

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
      where t.candidate_id=v_candidate order by t.created_at desc,t.transition_id desc limit 1),
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
      where t.candidate_id=v_candidate order by t.created_at desc,t.transition_id desc limit 1),
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
      where t.candidate_id=c.candidate_id order by t.created_at desc,t.transition_id desc limit 1),c.status),
    c.candidate_hash,c.observed_at,c.created_at,
    count(e.*) filter(where e.supports_or_contradicts='supports'),
    count(e.*) filter(where e.supports_or_contradicts='contradicts'),
    (select a.assessment_state from private.integrity_corroboration_assessment a
      where a.candidate_id=c.candidate_id order by a.assessed_at desc,a.assessment_id desc limit 1)
  from private.integrity_pattern_candidate c
  left join private.integrity_evidence_link e on e.candidate_id=c.candidate_id
  where c.is_current and (p_candidate_id is null or c.candidate_id=p_candidate_id)
  group by c.candidate_id;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.register_integrity_pattern_candidate_v1(jsonb) from public, anon, authenticated;
revoke all on function public.attach_integrity_candidate_evidence_v1(jsonb) from public, anon, authenticated;
revoke all on function public.record_integrity_corroboration_v1(jsonb) from public, anon, authenticated;
revoke all on function public.transition_integrity_candidate_v1(jsonb) from public, anon, authenticated;
revoke all on function public.create_integrity_escalation_packet_v1(jsonb) from public, anon, authenticated;
revoke all on function public.integrity_candidate_review_v1(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert on all tables in schema private to service_role;
grant execute on function public.register_integrity_pattern_candidate_v1(jsonb) to service_role;
grant execute on function public.attach_integrity_candidate_evidence_v1(jsonb) to service_role;
grant execute on function public.record_integrity_corroboration_v1(jsonb) to service_role;
grant execute on function public.transition_integrity_candidate_v1(jsonb) to service_role;
grant execute on function public.create_integrity_escalation_packet_v1(jsonb) to service_role;
grant execute on function public.integrity_candidate_review_v1(uuid) to service_role;

comment on table private.integrity_pattern_candidate is
  'Evidence-bound integrity pattern candidates. Rows never establish corruption, illegality, intent, or liability.';
comment on table private.integrity_escalation_packet is
  'Human-reviewable draft routing packets. Creation does not transmit a complaint or accuse a subject.';
