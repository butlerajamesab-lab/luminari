-- ============================================================================
-- Migration 13 -- complete, source-bound, per-member object/field diff.
-- No LIMIT 1 matching and no text-as-identity shortcut.  Resolved source spans
-- are the primary locators; unresolved objects use deterministic block/text
-- locators and remain visible as additions/removals.
-- ============================================================================

create or replace function rosetta_replay.plain_normalize(p text)
returns text language sql immutable as $fn$
  select nullif(btrim(regexp_replace(lower(coalesce($1,'')),'\s+',' ','g')),'');
$fn$;

create or replace function rosetta_replay.actor_value_defect(
    p_object_type text,p_actor text)
returns text language sql immutable
set search_path to 'pg_catalog'
as $fn$
  select case
    when p_object_type not in ('workflow_step','accountability_route','entity_override') then null
    -- A granting actor is optional for source-stated conditions/limitations;
    -- workflow and accountability actors are operational keys and may not be
    -- silently absent.
    when nullif(btrim(coalesce(p_actor,'')),'') is null
         and p_object_type in ('workflow_step','accountability_route') then 'actor_unresolved'
    when nullif(btrim(coalesce(p_actor,'')),'') is null then null
    when char_length(p_actor)>1024 then 'actor_overflow'
    when p_actor ~* '\m(skip to|main content|navigation|breadcrumb|menu|search|sign in|log in|subscribe|footer|header|go to top|back to top|share this|print this)\M'
      then 'navigation_chrome'
    when p_actor ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+);' then 'html_entity'
    when position(chr(65533) in p_actor)>0 then 'replacement_character'
    when p_actor ~* '\m(to read as follows|is amended to read|is further amended)\M'
      then 'amendatory_scaffold'
    when regexp_count(p_actor,'(?i)\m(shall|must|may)\M')>=2 then 'multiple_modal_clauses'
    else null end;
$fn$;

create or replace function rosetta_replay.classify_diff(
    p_control_value text,p_candidate_value text,p_correction_id text,
    p_control_defect text,p_candidate_defect text)
returns text language plpgsql immutable
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
begin
  if p_control_value is not distinct from p_candidate_value
     and p_control_defect is not distinct from p_candidate_defect then
    return 'unchanged';
  end if;
  if p_control_value is not null and p_candidate_value is null then return 'regression'; end if;
  if p_control_value is null and p_candidate_value is not null then return 'unexplained'; end if;
  if p_control_defect is not null and p_candidate_defect is null
     and nullif(btrim(coalesce(p_correction_id,'')),'') is not null then
    return 'improvement_declared';
  end if;
  if rosetta_replay.plain_normalize(p_control_value)
       is not distinct from rosetta_replay.plain_normalize(p_candidate_value)
     and p_candidate_defect is null then return 'neutral_relabel'; end if;
  if p_candidate_defect is not null then return 'regression'; end if;
  return 'unexplained';
end;
$fn$;

create table if not exists rosetta_replay.object_diff (
    diff_id              bigint generated always as identity primary key,
    manifest_id          uuid not null,
    source_registry_id   uuid not null,
    control_run_id       integer not null,
    candidate_attempt_id uuid not null,
    candidate_run_id     integer not null,
    object_type          text not null,
    object_locator       text not null,
    field                text not null,
    control_value        text,
    candidate_value      text,
    control_defect       text,
    candidate_defect     text,
    status               text not null check (status in
      ('unchanged','improvement_declared','regression','neutral_relabel','unexplained')),
    correction_id        text,
    engine_version       text not null,
    rule_set_version     text not null,
    configuration_hash   text not null,
    closure_hash         text not null,
    created_at           timestamptz not null default clock_timestamp(),
    unique(manifest_id,source_registry_id,candidate_attempt_id,
           object_type,object_locator,field)
);

create table if not exists rosetta_replay.member_diff_receipt (
    manifest_id          uuid not null,
    source_registry_id   uuid not null,
    candidate_attempt_id uuid not null,
    control_run_id       integer not null,
    candidate_run_id     integer not null,
    control_field_count  integer not null,
    candidate_field_count integer not null,
    union_field_count    integer not null,
    diff_row_count       integer not null,
    complete             boolean not null,
    diff_sha256          text not null check (diff_sha256 ~ '^[0-9a-f]{64}$'),
    created_at           timestamptz not null default clock_timestamp(),
    primary key(manifest_id,source_registry_id,candidate_attempt_id)
);

create or replace function rosetta_replay.reject_diff_evidence_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'object_diff_evidence_is_append_only' using errcode='raise_exception';
end;
$fn$;
drop trigger if exists object_diff_immutable on rosetta_replay.object_diff;
create trigger object_diff_immutable before update or delete on rosetta_replay.object_diff
for each row execute function rosetta_replay.reject_diff_evidence_mutation();
drop trigger if exists member_diff_receipt_immutable on rosetta_replay.member_diff_receipt;
create trigger member_diff_receipt_immutable before update or delete on rosetta_replay.member_diff_receipt
for each row execute function rosetta_replay.reject_diff_evidence_mutation();

-- One row for every object field in one run.  JSON null becomes SQL NULL but
-- remains an explicit row, so null actors are not lost from the comparison.
create or replace function rosetta_replay.run_object_field_snapshot(p_run_id integer)
returns table(object_type text,object_locator text,field text,field_value text,field_defect text)
language sql stable
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
with objects as (
  select 'workflow_step'::text object_type,ws.id object_id,wp.source_document_id,
         wp.source_block_id,ws.step_name clause_text,ws.actor actor_text,
         ws.verb modal_text,null::text override_type,null::text override_cue,
         null::text defined_term,null::text definition_text,
         null::text enforcement_type,null::text enforcement_direction,
         ws.governing_section boundary_text,'workflow'::text layer
  from rosetta_v2513.workflow_step ws
  join rosetta_v2513.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id
  where wp.extraction_run_id=p_run_id
  union all
  select 'accountability_route',ar.id,ar.source_document_id,ar.source_block_id,
         ar.trigger_condition,ar.enforcement_actor,ar.action_type,null,null,
         null,null,ar.enforcement_type,ar.enforcement_direction,
         ar.governing_section,'accountability'
  from rosetta_v2513.accountability_route ar where ar.extraction_run_id=p_run_id
  union all
  select 'entity_override',eo.id,eo.source_document_id,eo.source_block_id,
         eo.override_scope,eo.granting_actor,null,eo.override_type,
         lower((regexp_match(eo.override_scope,
           '(?i)\m(unless|however|except|notwithstanding|subject to|does not apply|do not apply)\M'))[1]),
         null,null,null,null,eo.overridden_authority,'override'
  from rosetta_v2513.entity_override eo where eo.extraction_run_id=p_run_id
  union all
  select 'term_definition',td.id,td.source_document_id,td.source_block_id,
         td.definition_text,null,null,null,null,td.defined_term,td.definition_text,
         null,null,td.defining_section,'definition'
  from rosetta_v2513.term_definition td where td.extraction_run_id=p_run_id
  union all
  select 'help_entity',he.id,he.source_document_id,he.source_block_id,
         he.entity_name,null,null,null,null,he.entity_name,null,null,null,
         he.governing_section,'help'
  from rosetta_v2513.help_entity he where he.extraction_run_id=p_run_id
), located as (
  select o.*,s.source_offset_start,s.source_offset_end,s.span_status,
         rb.char_offset_start block_start,rb.char_offset_end block_end,
         row_number() over(partition by o.object_type,o.source_document_id,
           coalesce(s.source_offset_start,rb.char_offset_start),
           coalesce(s.source_offset_end,rb.char_offset_end),
           encode(extensions.digest(convert_to(coalesce(o.clause_text,''),'UTF8'),'sha256'),'hex')
           order by o.object_id) occurrence_ordinal
  from objects o
  left join rosetta_v2513.rosetta_object_source_span s
    on s.extraction_run_id=p_run_id and s.object_type=o.object_type and s.object_id=o.object_id
  left join rosetta_v2513.hr1_raw_blocks rb on rb.id=o.source_block_id
), expanded as (
  select l.*,
    case when source_offset_start is not null and source_offset_end is not null
      then concat(source_document_id,'|',object_type,'|span:',source_offset_start,':',source_offset_end,
                  '|',occurrence_ordinal)
      else concat(source_document_id,'|',object_type,'|block:',coalesce(block_start,-1),':',
                  coalesce(block_end,-1),'|text:',encode(extensions.digest(convert_to(
                  coalesce(rosetta_replay.plain_normalize(clause_text),''),'UTF8'),'sha256'),'hex'),
                  '|',occurrence_ordinal) end object_locator,
    jsonb_build_object(
      '__presence','1','layer',layer,'clause',clause_text,'actor',actor_text,
      'modal',modal_text,'span_offset_start',source_offset_start,
      'span_offset_end',source_offset_end,'span_status',span_status,
      'override_type',override_type,'override_cue',override_cue,
      'defined_term',defined_term,'definition_text',definition_text,
      'definition_boundary',boundary_text,'enforcement_type',enforcement_type,
      'enforcement_direction',enforcement_direction) fields
  from located l
)
select e.object_type,e.object_locator,j.key,
       case when j.value='null'::jsonb then null else j.value#>>'{}' end,
       case
         when j.key='actor' then rosetta_replay.actor_value_defect(e.object_type,
              case when j.value='null'::jsonb then null else j.value#>>'{}' end)
         when j.key='span_status' and coalesce(j.value#>>'{}','unresolved')<>'resolved'
              then 'span_'||coalesce(j.value#>>'{}','missing')
         when j.key in ('span_offset_start','span_offset_end') and j.value='null'::jsonb
              then 'span_offset_missing'
         when exists(select 1 from rosetta_v2513.rosetta_structural_repair_queue q
              where q.extraction_run_id=p_run_id and q.object_type=e.object_type
                and q.object_id=e.object_id and q.repair_state='open')
              then 'open_structural_repair'
         else null end
from expanded e cross join lateral jsonb_each(e.fields) j;
$fn$;

create or replace function rosetta_replay.diff_member(
    p_manifest_id uuid,p_source_registry_id uuid,p_candidate_attempt_id uuid,
    p_correction_id text default null)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
declare
  m rosetta_replay.sealed_corpus_member%rowtype;
  b rosetta_replay.replay_run_binding%rowtype;
  v_control_count integer;v_candidate_count integer;v_union_count integer;v_diff_count integer;
  v_hash text;v_existing uuid;v_receipt uuid:=gen_random_uuid();
begin
  select * into strict m from rosetta_replay.sealed_corpus_member
  where manifest_id=p_manifest_id and source_registry_id=p_source_registry_id;
  if m.prior_output_state<>'admissible' or m.control_run_id is null then
    raise exception 'member % has no declared prior admissible output to diff',p_source_registry_id
      using errcode='P1D01';
  end if;
  select * into strict b from rosetta_replay.replay_run_binding
  where attempt_id=p_candidate_attempt_id and source_registry_id=p_source_registry_id
    and terminal_outcome='completed';
  if b.source_content_id is distinct from m.source_content_id
     or b.source_content_hash is distinct from m.source_content_hash then
    raise exception 'candidate binding belongs to a different manifest source'
      using errcode='P1D02';
  end if;
  select source_registry_id into v_existing
  from rosetta_replay.member_diff_receipt
  where manifest_id=p_manifest_id and source_registry_id=p_source_registry_id
    and candidate_attempt_id=p_candidate_attempt_id;
  if found then return v_existing; end if;

  with control as (select * from rosetta_replay.run_object_field_snapshot(m.control_run_id)),
  candidate as (select * from rosetta_replay.run_object_field_snapshot(b.extraction_run_id)),
  joined as (
    select coalesce(c.object_type,n.object_type) object_type,
           coalesce(c.object_locator,n.object_locator) object_locator,
           coalesce(c.field,n.field) field,c.field_value control_value,
           n.field_value candidate_value,c.field_defect control_defect,
           n.field_defect candidate_defect
    from control c full join candidate n using(object_type,object_locator,field)
  )
  insert into rosetta_replay.object_diff
    (manifest_id,source_registry_id,control_run_id,candidate_attempt_id,
     candidate_run_id,object_type,object_locator,field,control_value,
     candidate_value,control_defect,candidate_defect,status,correction_id,
     engine_version,rule_set_version,configuration_hash,closure_hash)
  select p_manifest_id,p_source_registry_id,m.control_run_id,p_candidate_attempt_id,
         b.extraction_run_id,j.object_type,j.object_locator,j.field,
         j.control_value,j.candidate_value,j.control_defect,j.candidate_defect,
         rosetta_replay.classify_diff(j.control_value,j.candidate_value,
           p_correction_id,j.control_defect,j.candidate_defect),
         case when j.control_defect is not null and j.candidate_defect is null
              then p_correction_id end,
         b.engine_version,b.rule_set_version,b.configuration_hash,b.closure_hash
  from joined j;

  select count(*) into v_control_count from rosetta_replay.run_object_field_snapshot(m.control_run_id);
  select count(*) into v_candidate_count from rosetta_replay.run_object_field_snapshot(b.extraction_run_id);
  select count(*) into v_union_count from (
    select object_type,object_locator,field from rosetta_replay.run_object_field_snapshot(m.control_run_id)
    union
    select object_type,object_locator,field from rosetta_replay.run_object_field_snapshot(b.extraction_run_id)
  ) u;
  select count(*),encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      object_type,object_locator,field,coalesce(control_value,'<NULL>'),
      coalesce(candidate_value,'<NULL>'),coalesce(control_defect,''),
      coalesce(candidate_defect,''),status,coalesce(correction_id,'')),chr(10)
      order by object_type,object_locator,field),''),'UTF8'),'sha256'),'hex')
    into v_diff_count,v_hash
  from rosetta_replay.object_diff
  where manifest_id=p_manifest_id and source_registry_id=p_source_registry_id
    and candidate_attempt_id=p_candidate_attempt_id;

  insert into rosetta_replay.member_diff_receipt
    (manifest_id,source_registry_id,candidate_attempt_id,control_run_id,
     candidate_run_id,control_field_count,candidate_field_count,
     union_field_count,diff_row_count,complete,diff_sha256)
  values(p_manifest_id,p_source_registry_id,p_candidate_attempt_id,m.control_run_id,
     b.extraction_run_id,v_control_count,v_candidate_count,v_union_count,
     v_diff_count,v_diff_count=v_union_count,v_hash);
  if v_diff_count<>v_union_count then
    raise exception 'diff completeness failure: wrote %, expected union %',v_diff_count,v_union_count
      using errcode='P1D03';
  end if;
  return p_source_registry_id;
end;
$fn$;

-- Legacy unbound entry points now fail closed instead of fabricating evidence.
create or replace function rosetta_replay.diff_runs(
    p_control_run integer,p_candidate_run integer,p_correction_id text default null,
    p_manifest_id uuid default null,p_engine_version text default null,
    p_rule_set_version text default null,p_config_hash text default null,
    p_closure_hash text default null)
returns integer language plpgsql as $fn$
begin
  raise exception 'unbound_diff_forbidden: use diff_member(manifest, source, candidate_attempt, correction)'
    using errcode='P1D04';
end;
$fn$;

create or replace function rosetta_replay.diff_workflow_step_actors(
    p_control_run integer,p_candidate_run integer,p_correction_id text default null)
returns integer language plpgsql as $fn$
begin
  raise exception 'unbound_diff_forbidden: use diff_member'
    using errcode='P1D04';
end;
$fn$;
