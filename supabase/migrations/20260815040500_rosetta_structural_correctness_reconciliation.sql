begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.term_definition
  add column if not exists section_declared text,
  add column if not exists section_observed text,
  add column if not exists section_status text;

alter table public.accountability_route
  add column if not exists clause_type text,
  add column if not exists action_type text,
  add column if not exists actor_canonical text,
  add column if not exists actor_label text,
  add column if not exists actor_source_text text,
  add column if not exists actor_canonical_type text,
  add column if not exists section_declared text,
  add column if not exists section_observed text,
  add column if not exists section_status text;

alter table public.accountability_route
  drop constraint if exists accountability_route_enforcement_direction_check;
alter table public.accountability_route
  add constraint accountability_route_enforcement_direction_check check (
    enforcement_direction in (
      'individual_penalty', 'agency_mandate', 'structural_override',
      'reporting_requirement', 'definition', 'court_order',
      'petition_authorization', 'prosecutorial_authority', 'procedure',
      'standard_of_proof'
    )
  );

alter table public.accountability_route
  add constraint accountability_route_clause_type_check check (
    clause_type is null or clause_type in (
      'definition', 'court_order', 'petition_authorization',
      'prosecutorial_authority', 'agency_mandate', 'procedure',
      'standard_of_proof'
    )
  );

alter table public.accountability_route
  add constraint accountability_route_action_type_check check (
    action_type is null or action_type in (
      'must', 'may', 'shall', 'is_entitled', 'is_subject_to'
    )
  );

alter table public.accountability_route
  add constraint accountability_route_section_status_check check (
    section_status is null or section_status in ('resolved', 'multi_section', 'unresolved')
  );

alter table public.term_definition
  add constraint term_definition_section_status_check check (
    section_status is null or section_status in ('resolved', 'multi_section', 'unresolved')
  );

create table if not exists public.rosetta_object_correction (
  correction_id uuid primary key default gen_random_uuid(),
  extraction_run_id integer not null references public.extraction_run(id) on delete cascade,
  source_document_id integer not null references public.source_document(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  field_name text not null,
  prior_value jsonb,
  corrected_value jsonb,
  correction_rule_version text not null,
  corrected_at timestamptz not null default now(),
  unique (object_type, object_id, field_name, correction_rule_version)
);

create table if not exists public.rosetta_canonical_clause (
  canonical_clause_id uuid primary key default gen_random_uuid(),
  normalized_text_hash text not null check (normalized_text_hash ~ '^[0-9a-f]{64}$'),
  normalized_text text not null,
  clause_type text not null,
  created_at timestamptz not null default now(),
  unique (normalized_text_hash, clause_type)
);

create table if not exists public.rosetta_clause_occurrence (
  occurrence_id uuid primary key default gen_random_uuid(),
  canonical_clause_id uuid not null references public.rosetta_canonical_clause(canonical_clause_id) on delete restrict,
  accountability_route_id text not null references public.accountability_route(id) on delete cascade,
  extraction_run_id integer not null references public.extraction_run(id) on delete cascade,
  source_document_id integer not null references public.source_document(id) on delete cascade,
  source_block_id text references public.hr1_raw_blocks(id) on delete restrict,
  source_offset_start integer,
  source_offset_end integer,
  section_observed text,
  section_status text not null,
  source_text text not null,
  created_at timestamptz not null default now(),
  unique (accountability_route_id)
);

create table if not exists public.rosetta_structural_repair_queue (
  repair_id uuid primary key default gen_random_uuid(),
  extraction_run_id integer not null references public.extraction_run(id) on delete cascade,
  source_document_id integer not null references public.source_document(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  defect_type text not null,
  defect_detail jsonb not null default '{}'::jsonb,
  repair_state text not null default 'open' check (repair_state in ('open','in_review','resolved','superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (object_type, object_id, defect_type)
);

create index if not exists rosetta_object_correction_run_idx
  on public.rosetta_object_correction(extraction_run_id);
create index if not exists rosetta_object_correction_document_idx
  on public.rosetta_object_correction(source_document_id);
create index if not exists rosetta_clause_occurrence_canonical_idx
  on public.rosetta_clause_occurrence(canonical_clause_id);
create index if not exists rosetta_clause_occurrence_run_idx
  on public.rosetta_clause_occurrence(extraction_run_id);
create index if not exists rosetta_clause_occurrence_document_idx
  on public.rosetta_clause_occurrence(source_document_id);
create index if not exists rosetta_clause_occurrence_block_idx
  on public.rosetta_clause_occurrence(source_block_id);
create index if not exists rosetta_structural_repair_run_idx
  on public.rosetta_structural_repair_queue(extraction_run_id);
create index if not exists rosetta_structural_repair_document_idx
  on public.rosetta_structural_repair_queue(source_document_id);

create or replace function public.rosetta_normalize_clause_text(p_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select trim(regexp_replace(
    regexp_replace(
      lower(p_text),
      '^\s*[0-9]+(?:\s+and\s+[0-9]+)?\s+c\s+[0-9]+\s+s\s+[0-9]+\s+(?:is|are)\s+(?:each\s+)?amended\s+to\s+read\s+as\s+follows:\s*',
      '',
      'i'
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;

create or replace function public.rosetta_reconcile_structural_correctness(
  p_extraction_run_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_definition_count integer := 0;
  v_accountability_count integer := 0;
  v_occurrence_count integer := 0;
  v_open_repair_count integer := 0;
begin
  insert into public.rosetta_object_correction (
    extraction_run_id, source_document_id, object_type, object_id,
    field_name, prior_value, corrected_value, correction_rule_version
  )
  select
    definition.extraction_run_id,
    definition.source_document_id,
    'definition',
    definition.id,
    'defining_section',
    to_jsonb(definition.defining_section),
    to_jsonb(block.section_number),
    'rosetta-structural-reconciliation-v1'
  from public.term_definition definition
  join public.hr1_raw_blocks block on block.id = definition.source_block_id
  where definition.extraction_run_id = p_extraction_run_id
    and definition.defining_section is distinct from block.section_number
  on conflict do nothing;

  update public.term_definition definition
     set defining_section = block.section_number,
         section_declared = block.section_number,
         section_observed = block.section_number,
         section_status = 'resolved'
    from public.hr1_raw_blocks block
   where definition.extraction_run_id = p_extraction_run_id
     and block.id = definition.source_block_id;
  get diagnostics v_definition_count = row_count;

  update public.term_definition
     set section_declared = coalesce(section_declared, defining_section),
         section_status = coalesce(section_status, 'unresolved')
   where extraction_run_id = p_extraction_run_id;

  insert into public.rosetta_object_correction (
    extraction_run_id, source_document_id, object_type, object_id,
    field_name, prior_value, corrected_value, correction_rule_version
  )
  select
    route.extraction_run_id,
    route.source_document_id,
    'accountability',
    route.id,
    'classification_and_actor',
    jsonb_build_object(
      'enforcement_direction', route.enforcement_direction,
      'enforcement_actor', route.enforcement_actor,
      'governing_section', route.governing_section
    ),
    jsonb_build_object(
      'clause_type', case
        when route.trigger_condition ~* '\mthe\s+court\M' and route.trigger_condition ~* '\mshall\M'
          then 'court_order'
        when route.trigger_condition ~* '\mprosecut(?:ing|or)\M' and route.trigger_condition ~* '\m(?:file|petition)\M'
          then 'prosecutorial_authority'
        when route.trigger_condition ~* '\mpetition\M' and route.trigger_condition ~* '\m(?:may|shall)\M'
          then 'petition_authorization'
        when route.trigger_condition ~* '\mbeyond\s+a\s+reasonable\s+doubt\M'
          then 'standard_of_proof'
        when route.trigger_condition ~* '\m(?:department|agency|secretary)\M' and route.trigger_condition ~* '\m(?:shall|must)\M'
          then 'agency_mandate'
        else 'procedure'
      end,
      'section_observed', block.section_number
    ),
    'rosetta-structural-reconciliation-v1'
  from public.accountability_route route
  join public.hr1_raw_blocks block on block.id = route.source_block_id
  where route.extraction_run_id = p_extraction_run_id
  on conflict do nothing;

  update public.accountability_route route
     set actor_source_text = coalesce(route.actor_source_text, route.enforcement_actor),
         governing_section = block.section_number,
         section_declared = block.section_number,
         section_observed = block.section_number,
         section_status = 'resolved',
         clause_type = case
           when route.trigger_condition ~* '\mthe\s+court\M' and route.trigger_condition ~* '\mshall\M'
             then 'court_order'
           when route.trigger_condition ~* '\mprosecut(?:ing|or)\M' and route.trigger_condition ~* '\m(?:file|petition)\M'
             then 'prosecutorial_authority'
           when route.trigger_condition ~* '\mpetition\M' and route.trigger_condition ~* '\m(?:may|shall)\M'
             then 'petition_authorization'
           when route.trigger_condition ~* '\mbeyond\s+a\s+reasonable\s+doubt\M'
             then 'standard_of_proof'
           when route.trigger_condition ~* '\m(?:department|agency|secretary)\M' and route.trigger_condition ~* '\m(?:shall|must)\M'
             then 'agency_mandate'
           else 'procedure'
         end,
         action_type = case
           when route.trigger_condition ~* '\mis\s+entitled\s+to\M' then 'is_entitled'
           when route.trigger_condition ~* '\mis\s+subject\s+to\M' then 'is_subject_to'
           when route.trigger_condition ~* '\mshall\M' then 'shall'
           when route.trigger_condition ~* '\mmust\M' then 'must'
           when route.trigger_condition ~* '\mmay\M' then 'may'
           else null
         end,
         actor_canonical = case
           when route.trigger_condition ~* '\mprosecut(?:ing\s+attorney|or)\M' then 'prosecuting_attorney'
           when route.trigger_condition ~* '\mdepartment\s+of\s+social\s+and\s+health\s+services\M' then 'department_of_social_and_health_services'
           when route.trigger_condition ~* '\mthe\s+court\M' then 'court'
           when route.trigger_condition ~* '\msecretary\M' then 'secretary'
           when route.trigger_condition ~* '\mrespondent\M' then 'respondent'
           when route.trigger_condition ~* '\mpetitioner\M' then 'petitioner'
           when route.trigger_condition ~* '\mcounty\M' then 'county'
           else null
         end,
         actor_label = case
           when route.trigger_condition ~* '\mprosecut(?:ing\s+attorney|or)\M' then 'Prosecuting Attorney'
           when route.trigger_condition ~* '\mdepartment\s+of\s+social\s+and\s+health\s+services\M' then 'Department of Social and Health Services'
           when route.trigger_condition ~* '\mthe\s+court\M' then 'Court'
           when route.trigger_condition ~* '\msecretary\M' then 'Secretary'
           when route.trigger_condition ~* '\mrespondent\M' then 'Respondent'
           when route.trigger_condition ~* '\mpetitioner\M' then 'Petitioner'
           when route.trigger_condition ~* '\mcounty\M' then 'County'
           else null
         end,
         actor_canonical_type = case
           when route.trigger_condition ~* '\mprosecut(?:ing\s+attorney|or)\M' then 'prosecutor'
           when route.trigger_condition ~* '\mdepartment\s+of\s+social\s+and\s+health\s+services\M' then 'department'
           when route.trigger_condition ~* '\mthe\s+court\M' then 'court'
           when route.trigger_condition ~* '\msecretary\M' then 'secretary'
           when route.trigger_condition ~* '\mrespondent\M' then 'respondent'
           when route.trigger_condition ~* '\mpetitioner\M' then 'petitioner'
           when route.trigger_condition ~* '\mcounty\M' then 'agency'
           else null
         end,
         enforcement_direction = case
           when route.trigger_condition ~* '\mthe\s+court\M' and route.trigger_condition ~* '\mshall\M' then 'court_order'
           when route.trigger_condition ~* '\mprosecut(?:ing|or)\M' and route.trigger_condition ~* '\m(?:file|petition)\M' then 'prosecutorial_authority'
           when route.trigger_condition ~* '\mpetition\M' and route.trigger_condition ~* '\m(?:may|shall)\M' then 'petition_authorization'
           when route.trigger_condition ~* '\mbeyond\s+a\s+reasonable\s+doubt\M' then 'standard_of_proof'
           when route.trigger_condition ~* '\m(?:department|agency|secretary)\M' and route.trigger_condition ~* '\m(?:shall|must)\M' then 'agency_mandate'
           else 'procedure'
         end,
         enforcement_actor = case
           when route.trigger_condition ~* '\mprosecut(?:ing\s+attorney|or)\M' then 'Prosecuting Attorney'
           when route.trigger_condition ~* '\mdepartment\s+of\s+social\s+and\s+health\s+services\M' then 'Department of Social and Health Services'
           when route.trigger_condition ~* '\mthe\s+court\M' then 'Court'
           when route.trigger_condition ~* '\msecretary\M' then 'Secretary'
           when route.trigger_condition ~* '\mrespondent\M' then 'Respondent'
           when route.trigger_condition ~* '\mpetitioner\M' then 'Petitioner'
           when route.trigger_condition ~* '\mcounty\M' then 'County'
           else null
         end
    from public.hr1_raw_blocks block
   where route.extraction_run_id = p_extraction_run_id
     and block.id = route.source_block_id;
  get diagnostics v_accountability_count = row_count;

  insert into public.rosetta_canonical_clause (
    normalized_text_hash, normalized_text, clause_type
  )
  select distinct
    encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required), 'UTF8'), 'sha256'), 'hex'),
    public.rosetta_normalize_clause_text(node.action_required),
    route.clause_type
  from public.accountability_route route
  join public.escalation_node node on node.accountability_route_id = route.id
  where route.extraction_run_id = p_extraction_run_id
    and public.rosetta_normalize_clause_text(node.action_required) <> ''
  on conflict (normalized_text_hash, clause_type) do nothing;

  insert into public.rosetta_clause_occurrence (
    canonical_clause_id, accountability_route_id, extraction_run_id,
    source_document_id, source_block_id, source_offset_start, source_offset_end,
    section_observed, section_status, source_text
  )
  select
    canonical.canonical_clause_id,
    route.id,
    route.extraction_run_id,
    route.source_document_id,
    route.source_block_id,
    block.char_offset_start,
    block.char_offset_end,
    block.section_number,
    route.section_status,
    node.action_required
  from public.accountability_route route
  join public.escalation_node node on node.accountability_route_id = route.id
  join public.hr1_raw_blocks block on block.id = route.source_block_id
  join public.rosetta_canonical_clause canonical
    on canonical.normalized_text_hash = encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required), 'UTF8'), 'sha256'), 'hex')
   and canonical.clause_type = route.clause_type
  where route.extraction_run_id = p_extraction_run_id
  on conflict (accountability_route_id) do update
    set canonical_clause_id = excluded.canonical_clause_id,
        section_observed = excluded.section_observed,
        section_status = excluded.section_status,
        source_text = excluded.source_text;
  get diagnostics v_occurrence_count = row_count;

  insert into public.rosetta_structural_repair_queue (
    extraction_run_id, source_document_id, object_type, object_id,
    defect_type, defect_detail
  )
  select
    route.extraction_run_id,
    route.source_document_id,
    'accountability',
    route.id,
    'actor_unresolved',
    jsonb_build_object('actor_source_text', route.actor_source_text)
  from public.accountability_route route
  where route.extraction_run_id = p_extraction_run_id
    and route.actor_canonical is null
  on conflict do nothing;

  update public.rosetta_structural_repair_queue repair
     set repair_state = 'resolved', resolved_at = now()
    from public.accountability_route route
   where repair.object_type = 'accountability'
     and repair.object_id = route.id
     and repair.defect_type = 'actor_unresolved'
     and route.actor_canonical is not null
     and repair.repair_state <> 'resolved';

  select count(*)::integer into v_open_repair_count
  from public.rosetta_structural_repair_queue
  where extraction_run_id = p_extraction_run_id
    and repair_state in ('open', 'in_review');

  return jsonb_build_object(
    'contract', 'rosetta-structural-reconciliation-v1',
    'extraction_run_id', p_extraction_run_id,
    'definition_count', v_definition_count,
    'accountability_count', v_accountability_count,
    'clause_occurrence_count', v_occurrence_count,
    'open_repair_count', v_open_repair_count,
    'publication_state', case when v_open_repair_count > 0 then 'verified_with_defects' else 'verified' end
  );
end;
$$;

create or replace function public.run_rosetta_v3_extraction(
  p_source_document_id integer,
  p_source_text text,
  p_expected_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_media_type text default 'text/plain',
  p_source_byte_hash text default null,
  p_source_provider_hash text default null,
  p_reference_date date default null,
  p_text_extractor_version text default 'plain-text-1',
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set statement_timeout = '120s'
set search_path = pg_catalog, public, extensions
as $$
declare
  v_receipt jsonb;
  v_run_id integer;
  v_reconciliation jsonb;
  v_output jsonb;
  v_output_hash text;
begin
  v_receipt := public.run_rosetta_v3_extraction_v23_base(
    p_source_document_id, p_source_text, p_expected_source_content_hash,
    p_source_url, p_source_version, p_media_type, p_source_byte_hash,
    p_source_provider_hash, p_reference_date, p_text_extractor_version,
    p_source_metadata
  );

  if coalesce(v_receipt ->> 'run_status', '') <> 'completed'
     or coalesce(v_receipt ->> 'admissibility_state', '') <> 'admissible' then
    return v_receipt;
  end if;

  v_run_id := nullif(v_receipt ->> 'extraction_run_id', '')::integer;
  if v_run_id is null then return v_receipt; end if;

  v_receipt := public.rosetta_v23_finalize_extraction(
    v_run_id, p_source_text, coalesce(p_source_metadata, '{}'::jsonb), v_receipt
  );
  v_reconciliation := public.rosetta_reconcile_structural_correctness(v_run_id);
  v_output := public.rosetta_v23_canonical_output(v_run_id);
  v_output_hash := encode(digest(convert_to(v_output::text, 'UTF8'), 'sha256'), 'hex');

  update public.extraction_run
     set output_content_hash = v_output_hash
   where id = v_run_id;
  update public.extraction_manifest
     set output_hash = v_output_hash,
         validation_results = coalesce(validation_results, '{}'::jsonb)
           || jsonb_build_object('structural_reconciliation_v1', v_reconciliation)
   where extraction_run_id = v_run_id;

  return v_receipt || jsonb_build_object(
    'output_content_hash', v_output_hash,
    'structural_reconciliation', v_reconciliation
  );
end;
$$;

alter table public.term_definition
  drop constraint if exists term_definition_confirmed_section_resolved;
alter table public.term_definition
  add constraint term_definition_confirmed_section_resolved check (
    coalesce(signal_status, '') <> 'confirmed'
    or (
      section_status = 'resolved'
      and section_declared is not distinct from section_observed
    )
  ) not valid;

revoke all on table public.rosetta_object_correction from public, anon, authenticated;
revoke all on table public.rosetta_canonical_clause from public, anon, authenticated;
revoke all on table public.rosetta_clause_occurrence from public, anon, authenticated;
revoke all on table public.rosetta_structural_repair_queue from public, anon, authenticated;
grant select on table public.rosetta_canonical_clause to service_role;
grant select on table public.rosetta_clause_occurrence to service_role;
grant select, insert, update on table public.rosetta_structural_repair_queue to service_role;
revoke execute on function public.rosetta_reconcile_structural_correctness(integer)
  from public, anon, authenticated;
grant execute on function public.rosetta_reconcile_structural_correctness(integer) to service_role;

select public.rosetta_reconcile_structural_correctness(id)
from public.extraction_run
where run_status = 'completed'
  and admissibility_state = 'admissible';

alter table public.term_definition
  validate constraint term_definition_confirmed_section_resolved;

commit;
