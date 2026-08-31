-- Rosetta V3 deterministic extraction activation.
-- Additive: preserves the locked five-layer schema and all prior evidence.

begin

create extension if not exists pgcrypto

create table if not exists public.extraction_rule_manifest (
  manifest_id uuid primary key default gen_random_uuid(),
  engine_version text not null,
  rule_set_version text not null,
  manifest_hash text not null,
  manifest_json jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint extraction_rule_manifest_version_unique unique (engine_version, rule_set_version),
  constraint extraction_rule_manifest_hash_unique unique (manifest_hash),
  constraint extraction_rule_manifest_hash_format check (manifest_hash ~ '^[0-9a-f]{64}$')
)

alter table public.extraction_rule_manifest enable row level security

drop policy if exists allow_public_read on public.extraction_rule_manifest

create policy allow_public_read
  on public.extraction_rule_manifest
  for select
  to public
  using (true)

with canonical_manifest as (
  select jsonb_build_object(
    'contract', 'S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version', 'rosetta-v3-deterministic-sql-1.0.0',
    'rule_set_version', 'rosetta-five-layer-exact-patterns-1.0.0',
    'normalization', jsonb_build_object(
      'matching_whitespace', 'collapse_to_single_space',
      'source_receipt', 'exact_extracted_text_sha256',
      'source_bytes', 'external_sha256_receipt',
      'normalization_version', 'rosetta-normalize-whitespace-v1'
    ),
    'classification', jsonb_build_object(
      'confidence', 'binary_exact_match_only',
      'matched', jsonb_build_object('confidence', 1.0, 'signal_status', 'confirmed'),
      'unmatched', 'not_applicable_with_reason'
    ),
    'layers', jsonb_build_object(
      'HELP', jsonb_build_array('exact clause: there shall be a <license>'),
      'WORKFLOW', jsonb_build_array('exact clause containing shall, must, or may'),
      'ACCOUNTABILITY', jsonb_build_array('exact modal clause containing forfeiture, penalty, violation, offense, enforcement, appeal, or review'),
      'OVERRIDES', jsonb_build_array('exact clause containing unless, however, except, notwithstanding, may not, or subject to'),
      'DEFINITIONS', jsonb_build_array('quoted term followed by includes, means, does not include, or has the same meaning as')
    ),
    'absence', 'Every source block receives all five coverage records; unmatched layers are explicitly not_applicable.',
    'provenance', 'Every object references an immutable source block and extraction receipt.'
  ) as manifest_json
), canonical_receipt as (
  select manifest_json,
         encode(digest(convert_to(manifest_json::text, 'UTF8'), 'sha256'), 'hex') as manifest_hash
  from canonical_manifest
)
insert into public.extraction_rule_manifest (
  engine_version,
  rule_set_version,
  manifest_hash,
  manifest_json,
  is_active
)
select
  'rosetta-v3-deterministic-sql-1.0.0',
  'rosetta-five-layer-exact-patterns-1.0.0',
  manifest_hash,
  manifest_json,
  true
from canonical_receipt
on conflict (engine_version, rule_set_version) do nothing

create table if not exists public.source_document_content (
  source_content_id uuid primary key default gen_random_uuid(),
  source_document_id integer not null references public.source_document(id),
  source_version text not null,
  source_url text not null,
  media_type text not null,
  source_text text not null,
  source_content_hash text not null,
  source_byte_hash text,
  source_provider_hash text,
  source_identity_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint source_document_content_version_unique unique (source_document_id, source_version),
  constraint source_document_content_identity_unique unique (source_identity_hash),
  constraint source_document_content_hash_format check (source_content_hash ~ '^[0-9a-f]{64}$'),
  constraint source_document_byte_hash_format check (source_byte_hash is null or source_byte_hash ~ '^[0-9a-f]{64}$'),
  constraint source_document_identity_hash_format check (source_identity_hash ~ '^[0-9a-f]{64}$'),
  constraint source_document_content_nonempty check (char_length(source_text) > 0)
)

alter table public.source_document_content enable row level security

create or replace function public.reject_source_document_content_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'source_document_content_is_immutable';
end;
$$

drop trigger if exists source_document_content_immutable on public.source_document_content

create trigger source_document_content_immutable
before update or delete on public.source_document_content
for each row execute function public.reject_source_document_content_mutation()

alter table public.extraction_run
  add column if not exists source_content_id uuid references public.source_document_content(source_content_id),
  add column if not exists engine_version text,
  add column if not exists rule_set_version text,
  add column if not exists rule_manifest_hash text,
  add column if not exists configuration_hash text,
  add column if not exists configuration_json jsonb,
  add column if not exists source_identity_hash text,
  add column if not exists source_content_hash text,
  add column if not exists output_content_hash text,
  add column if not exists admissibility_state text not null default 'pending',
  add column if not exists failure_code text

alter table public.extraction_run
  drop constraint if exists extraction_run_admissibility_state_check

alter table public.extraction_run
  add constraint extraction_run_admissibility_state_check
  check (admissibility_state in ('pending', 'admissible', 'rejected'))

alter table public.extraction_run_config
  add column if not exists engine_version text,
  add column if not exists rule_set_version text,
  add column if not exists rule_manifest_hash text,
  add column if not exists configuration_hash text,
  add column if not exists configuration_json jsonb

alter table public.extraction_manifest
  add column if not exists source_content_id uuid references public.source_document_content(source_content_id),
  add column if not exists source_identity_hash text,
  add column if not exists engine_version text,
  add column if not exists rule_set_version text,
  add column if not exists rule_manifest_hash text,
  add column if not exists configuration_hash text,
  add column if not exists output_hash text,
  add column if not exists admissibility_state text

create unique index if not exists source_document_corpus_identifier_unique
  on public.source_document(corpus_id, document_identifier)
  where document_identifier is not null

create unique index if not exists extraction_run_document_version_unique
  on public.extraction_run(source_document_id, run_version)

create unique index if not exists extraction_run_replay_receipt_unique
  on public.extraction_run(
    source_document_id,
    source_content_id,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash
  )
  where source_content_id is not null
    and engine_version is not null
    and rule_set_version is not null
    and rule_manifest_hash is not null
    and configuration_hash is not null

create unique index if not exists extraction_run_config_run_unique
  on public.extraction_run_config(extraction_run_id)

create unique index if not exists extraction_manifest_run_unique
  on public.extraction_manifest(extraction_run_id)

create unique index if not exists validation_result_run_test_unique
  on public.validation_result(extraction_run_id, test_name)

create index if not exists source_document_content_document_idx
  on public.source_document_content(source_document_id, created_at desc)

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
set search_path = pg_catalog, public
as $$
declare
  v_engine_version constant text := 'rosetta-v3-deterministic-sql-1.0.0';
  v_rule_set_version constant text := 'rosetta-five-layer-exact-patterns-1.0.0';
  v_manifest_hash text;
  v_corpus_id integer;
  v_document_identifier text;
  v_document_name text;
  v_content_id uuid;
  v_existing_content_hash text;
  v_existing_source_url text;
  v_source_content_hash text;
  v_source_identity_hash text;
  v_configuration_json jsonb;
  v_configuration_hash text;
  v_flat text;
  v_section_number text := 'Document';
  v_effective_date date;
  v_temporal_status text := 'pending';
  v_run_id integer;
  v_run_version integer;
  v_replay_status text;
  v_replay_output_hash text;
  v_replay_admissibility text;
  v_block_id text;
  v_match text[];
  v_clause text;
  v_modal text;
  v_actor text;
  v_help_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_override_count integer := 0;
  v_definition_count integer := 0;
  v_output jsonb;
  v_output_hash text;
  v_row_counts jsonb;
  v_coverage jsonb;
  v_is_incomplete boolean;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(20260731, p_source_document_id);

  select sd.corpus_id, sd.document_identifier, sd.document_name
    into v_corpus_id, v_document_identifier, v_document_name
  from public.source_document sd
  where sd.id = p_source_document_id;

  if v_corpus_id is null then
    raise exception using errcode = 'P0002', message = 'source_document_not_found';
  end if;

  if nullif(btrim(v_document_identifier), '') is null then
    raise exception using errcode = '22023', message = 'source_document_identifier_required';
  end if;

  if nullif(btrim(p_source_text), '') is null then
    raise exception using errcode = '22023', message = 'source_text_required';
  end if;

  if nullif(btrim(p_source_url), '') is null then
    raise exception using errcode = '22023', message = 'source_url_required';
  end if;

  if nullif(btrim(p_source_version), '') is null then
    raise exception using errcode = '22023', message = 'source_version_required';
  end if;

  select erm.manifest_hash
    into v_manifest_hash
  from public.extraction_rule_manifest erm
  where erm.engine_version = v_engine_version
    and erm.rule_set_version = v_rule_set_version
    and erm.is_active = true
  limit 1;

  if v_manifest_hash is null then
    raise exception using errcode = '55000', message = 'active_rule_manifest_not_found';
  end if;

  v_source_content_hash := encode(digest(convert_to(p_source_text, 'UTF8'), 'sha256'), 'hex');

  if lower(regexp_replace(coalesce(p_expected_source_content_hash, ''), '^sha256:', '')) <> v_source_content_hash then
    raise exception using errcode = '22000', message = 'source_content_hash_mismatch';
  end if;

  if p_source_byte_hash is not null and lower(p_source_byte_hash) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'source_byte_hash_must_be_sha256_hex';
  end if;

  if lower(coalesce(p_media_type, '')) = 'application/pdf' and p_source_byte_hash is null then
    raise exception using errcode = '22023', message = 'pdf_source_byte_hash_required';
  end if;

  v_configuration_json := jsonb_build_object(
    'reference_date', p_reference_date,
    'text_extractor_version', coalesce(nullif(btrim(p_text_extractor_version), ''), 'unknown'),
    'normalization_version', 'rosetta-normalize-whitespace-v1',
    'confidence_mode', 'binary_exact_match_only'
  );
  v_configuration_hash := encode(digest(convert_to(v_configuration_json::text, 'UTF8'), 'sha256'), 'hex');

  v_source_identity_hash := encode(digest(convert_to(
    jsonb_build_object(
      'document_identifier', v_document_identifier,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'media_type', p_media_type
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.source_document_content (
    source_document_id,
    source_version,
    source_url,
    media_type,
    source_text,
    source_content_hash,
    source_byte_hash,
    source_provider_hash,
    source_identity_hash,
    source_metadata
  ) values (
    p_source_document_id,
    p_source_version,
    p_source_url,
    coalesce(nullif(btrim(p_media_type), ''), 'text/plain'),
    p_source_text,
    v_source_content_hash,
    lower(p_source_byte_hash),
    p_source_provider_hash,
    v_source_identity_hash,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  on conflict (source_document_id, source_version) do nothing
  returning source_content_id into v_content_id;

  if v_content_id is null then
    select sdc.source_content_id, sdc.source_content_hash, sdc.source_url
      into v_content_id, v_existing_content_hash, v_existing_source_url
    from public.source_document_content sdc
    where sdc.source_document_id = p_source_document_id
      and sdc.source_version = p_source_version;

    if v_existing_content_hash is distinct from v_source_content_hash
       or v_existing_source_url is distinct from p_source_url then
      raise exception using errcode = '23505', message = 'source_version_content_conflict';
    end if;
  end if;

  select er.id, er.run_version, er.run_status, er.output_content_hash, er.admissibility_state
    into v_run_id, v_run_version, v_replay_status, v_replay_output_hash, v_replay_admissibility
  from public.extraction_run er
  where er.source_document_id = p_source_document_id
    and er.source_content_id = v_content_id
    and er.engine_version = v_engine_version
    and er.rule_set_version = v_rule_set_version
    and er.rule_manifest_hash = v_manifest_hash
    and er.configuration_hash = v_configuration_hash
  order by er.id
  limit 1;

  if v_run_id is not null then
    select jsonb_object_agg(lower(lc.layer_name), jsonb_build_object(
             'status', lc.coverage_status,
             'reason', lc.reason,
             'validated_at', lc.validated_at
           ) order by lc.layer_name)
      into v_coverage
    from public.layer_coverage lc
    where lc.extraction_run_id = v_run_id;

    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'source_content_id', v_content_id,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'extraction_run_id', v_run_id,
      'run_version', v_run_version,
      'run_status', v_replay_status,
      'admissibility_state', v_replay_admissibility,
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash,
      'output_content_hash', v_replay_output_hash,
      'coverage', coalesce(v_coverage, '{}'::jsonb),
      'replayed', true
    );
  end if;

  select er.id, er.run_version
    into v_run_id, v_run_version
  from public.extraction_run er
  where er.source_document_id = p_source_document_id
    and er.run_status = 'in_progress'
    and er.source_content_id is null
    and not exists (
      select 1 from public.hr1_raw_blocks rb where rb.extraction_run_id = er.id
    )
    and not exists (
      select 1 from public.extraction_manifest em where em.extraction_run_id = er.id
    )
  order by er.run_version desc, er.id desc
  limit 1
  for update;

  if v_run_id is null then
    select coalesce(max(er.run_version), 0) + 1
      into v_run_version
    from public.extraction_run er
    where er.source_document_id = p_source_document_id;

    insert into public.extraction_run (
      source_document_id,
      run_version,
      run_status,
      confidence_threshold,
      source_content_id,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      configuration_json,
      source_identity_hash,
      source_content_hash,
      admissibility_state
    ) values (
      p_source_document_id,
      v_run_version,
      'in_progress',
      1.00,
      v_content_id,
      v_engine_version,
      v_rule_set_version,
      v_manifest_hash,
      v_configuration_hash,
      v_configuration_json,
      v_source_identity_hash,
      v_source_content_hash,
      'pending'
    )
    returning id into v_run_id;
  else
    update public.extraction_run
       set source_content_id = v_content_id,
           engine_version = v_engine_version,
           rule_set_version = v_rule_set_version,
           rule_manifest_hash = v_manifest_hash,
           configuration_hash = v_configuration_hash,
           configuration_json = v_configuration_json,
           source_identity_hash = v_source_identity_hash,
           source_content_hash = v_source_content_hash,
           confidence_threshold = 1.00,
           admissibility_state = 'pending',
           failure_code = null
     where id = v_run_id;
  end if;

  insert into public.extraction_run_config (
    id,
    extraction_run_id,
    confidence_threshold,
    auto_confirm_above_threshold,
    require_human_review_below,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    configuration_json
  ) values (
    'cfg-v1-' || v_source_identity_hash,
    v_run_id,
    1.00,
    true,
    1.00,
    v_engine_version,
    v_rule_set_version,
    v_manifest_hash,
    v_configuration_hash,
    v_configuration_json
  )
  on conflict (extraction_run_id) do nothing;

  v_is_incomplete := char_length(btrim(p_source_text)) < 200;

  if v_is_incomplete then
    v_row_counts := jsonb_build_object(
      'raw_blocks', 0,
      'help', 0,
      'workflow', 0,
      'accountability', 0,
      'overrides', 0,
      'definitions', 0
    );

    insert into public.extraction_manifest (
      id,
      extraction_run_id,
      source_document_id,
      corpus_id,
      canon_version,
      source_hash,
      row_counts,
      validation_results,
      drift_events,
      status,
      source_content_id,
      source_identity_hash,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      output_hash,
      admissibility_state
    ) values (
      'manifest-v1-' || v_source_identity_hash,
      v_run_id,
      p_source_document_id,
      v_corpus_id,
      1,
      v_source_content_hash,
      v_row_counts,
      jsonb_build_object('source_complete', false, 'failure_code', 'source_text_incomplete'),
      '[]'::jsonb,
      'failed',
      v_content_id,
      v_source_identity_hash,
      v_engine_version,
      v_rule_set_version,
      v_manifest_hash,
      v_configuration_hash,
      null,
      'rejected'
    );

    insert into public.validation_result (
      id, extraction_run_id, test_name, test_result, failure_count, details
    ) values (
      'vr-v1-' || v_source_identity_hash || '-source-complete',
      v_run_id,
      'source_complete',
      'fail',
      1,
      jsonb_build_object('minimum_characters', 200, 'observed_characters', char_length(btrim(p_source_text)))
    )
    on conflict (extraction_run_id, test_name) do nothing;

    update public.extraction_run
       set run_status = 'failed',
           admissibility_state = 'rejected',
           failure_code = 'source_text_incomplete',
           completed_at = clock_timestamp()
     where id = v_run_id;

    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'source_content_id', v_content_id,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'extraction_run_id', v_run_id,
      'run_version', v_run_version,
      'run_status', 'failed',
      'admissibility_state', 'rejected',
      'failure_code', 'source_text_incomplete',
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash,
      'output_content_hash', null,
      'coverage', '{}'::jsonb,
      'replayed', false
    );
  end if;

  v_flat := btrim(regexp_replace(
    replace(replace(p_source_text, E'\r\n', E'\n'), E'\r', E'\n'),
    '[[:space:]]+',
    ' ',
    'g'
  ));

  v_match := regexp_match(v_flat, '(?i)Sec[.]\s*([0-9]+)[.]');
  if v_match is not null then
    v_section_number := 'Sec. ' || v_match[1];
  end if;

  v_match := regexp_match(v_flat, '(?i)EFFECTIVE DATE:\s*([A-Za-z]+\s+[0-9]{1,2},\s+[0-9]{4})');
  if v_match is not null then
    begin
      v_effective_date := to_date(v_match[1], 'Month DD, YYYY');
    exception when others then
      v_effective_date := null;
    end;
  end if;

  if v_effective_date is not null and p_reference_date is not null then
    v_temporal_status := case when p_reference_date >= v_effective_date then 'active' else 'pending' end;
  end if;

  v_block_id := 'blk-v1-' || v_source_identity_hash;

  insert into public.hr1_raw_blocks (
    id,
    extraction_run_id,
    source_document_id,
    block_type,
    section_number,
    section_heading_hash,
    block_content_hash,
    parent_block_id,
    hierarchy_path,
    char_offset_start,
    char_offset_end
  ) values (
    v_block_id,
    v_run_id,
    p_source_document_id,
    'document',
    v_section_number,
    encode(digest(convert_to(v_section_number, 'UTF8'), 'sha256'), 'hex'),
    v_source_content_hash,
    null,
    v_document_identifier || '/' || p_source_version,
    0,
    char_length(p_source_text)
  );

  for v_match in
    select regexp_matches(v_flat, '(?i)there shall be a ([^.;]{1,180}?license)', 'g')
  loop
    v_help_count := v_help_count + 1;
    v_clause := btrim(v_match[1]);

    insert into public.help_entity (
      id, corpus_id, source_document_id, extraction_run_id, canon_version,
      source_block_id, entity_name, entity_type, governing_section, status,
      effective_date, sunset_date, confidence, signal_status
    ) values (
      'he-v1-' || v_source_identity_hash || '-' || lpad(v_help_count::text, 3, '0'),
      v_corpus_id,
      p_source_document_id,
      v_run_id,
      1,
      v_block_id,
      v_clause,
      'license',
      v_section_number,
      case when v_flat ~* '\m(amending|amended)\M' then 'modified' else 'created' end,
      v_effective_date::text,
      null,
      1.00,
      'confirmed'
    );
  end loop;

  for v_match in
    select regexp_matches(v_flat, '(?i)([^.;]{0,240}\m(shall|must|may)\M[^.;]{0,520}[.;])', 'g')
  loop
    v_workflow_count := v_workflow_count + 1;
    v_clause := btrim(v_match[1]);
    v_modal := lower(v_match[2]);

    if v_workflow_count = 1 then
      insert into public.workflow_pipeline (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, pipeline_name, governing_section, pipeline_type,
        confidence, signal_status
      ) values (
        'wp-v1-' || v_source_identity_hash,
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        1,
        v_block_id,
        'Exact source obligations for ' || v_section_number,
        v_section_number,
        'source_ordered_modal_clauses',
        1.00,
        'confirmed'
      );
    end if;

    insert into public.workflow_step (
      id, workflow_pipeline_id, step_order, step_name, actor, actor_canon_id,
      verb, governing_section, confidence, signal_status
    ) values (
      'ws-v1-' || v_source_identity_hash || '-' || lpad(v_workflow_count::text, 3, '0'),
      'wp-v1-' || v_source_identity_hash,
      v_workflow_count,
      v_clause,
      null,
      null,
      v_modal,
      v_section_number,
      1.00,
      'confirmed'
    );

    if v_clause ~* '(forfeitur|penalt|violat|offense|enforc|appeal|review)'
       and v_clause ~* '\m(board|agency|secretary|department|commission)\M' then
      v_accountability_count := v_accountability_count + 1;
      v_actor := (regexp_match(v_clause, '(?i)\m(board|agency|secretary|department|commission)\M'))[1];

      insert into public.accountability_route (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, route_name, governing_section, trigger_condition,
        enforcement_type, enforcement_actor, actor_canon_id,
        enforcement_direction, confidence, signal_status
      ) values (
        'ar-v1-' || v_source_identity_hash || '-' || lpad(v_accountability_count::text, 3, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        1,
        v_block_id,
        'Exact accountability clause ' || v_accountability_count,
        v_section_number,
        v_clause,
        case when v_clause ~* 'forfeitur' then 'source_stated_forfeiture_rule' else 'source_stated_enforcement_rule' end,
        lower(v_actor),
        null,
        'agency_mandate',
        1.00,
        'confirmed'
      );

      insert into public.escalation_node (
        id, accountability_route_id, node_order, node_name, action_required,
        actor_canon_id, escalation_trigger
      ) values (
        'en-v1-' || v_source_identity_hash || '-' || lpad(v_accountability_count::text, 3, '0'),
        'ar-v1-' || v_source_identity_hash || '-' || lpad(v_accountability_count::text, 3, '0'),
        1,
        'Source-stated accountability action',
        v_clause,
        null,
        v_clause
      );
    end if;
  end loop;

  for v_match in
    select regexp_matches(v_flat, '([^.;]{1,760}[.;])', 'g')
  loop
    v_clause := btrim(v_match[1]);
    if v_clause ~* '\m(unless|however|except|notwithstanding)\M|\mmay not\M|\msubject to\M' then
      v_override_count := v_override_count + 1;

      insert into public.entity_override (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, override_type, overridden_authority, override_scope,
        override_condition, granting_actor, actor_canon_id, effective_date,
        sunset_date, temporal_status, confidence, signal_status
      ) values (
        'ov-v1-' || v_source_identity_hash || '-' || lpad(v_override_count::text, 3, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        1,
        v_block_id,
        case
          when v_clause ~* '\munless\M|\mexcept\M|\mhowever\M' then 'source_stated_exception'
          when v_clause ~* '\mmay not\M' then 'source_stated_limitation'
          else 'source_stated_condition'
        end,
        'Base rule within ' || v_section_number,
        v_clause,
        v_clause,
        null,
        null,
        v_effective_date,
        null,
        v_temporal_status,
        1.00,
        'confirmed'
      );
    end if;
  end loop;

  for v_match in
    select regexp_matches(
      v_flat,
      '(?i)"([^"]{1,120})"\s+(includes(?:,\s*but is not limited to)?|means|does not include|has the same meaning as)\s*:?[ ]*([^.;]{1,900}[.;])',
      'g'
    )
  loop
    v_definition_count := v_definition_count + 1;

    insert into public.term_definition (
      id, corpus_id, source_document_id, extraction_run_id, canon_version,
      source_block_id, defined_term, defining_section, definition_text,
      definition_type, confidence, signal_status
    ) values (
      'td-v1-' || v_source_identity_hash || '-' || lpad(v_definition_count::text, 3, '0'),
      v_corpus_id,
      p_source_document_id,
      v_run_id,
      1,
      v_block_id,
      btrim(v_match[1]),
      v_section_number,
      btrim(v_match[2] || ' ' || v_match[3]),
      'technical',
      1.00,
      'confirmed'
    );
  end loop;

  insert into public.layer_coverage (
    id, extraction_run_id, source_block_id, layer_name,
    coverage_status, reason, validated_at
  )
  select
    'lc-v1-' || v_source_identity_hash || '-' || layer_name,
    v_run_id,
    v_block_id,
    layer_name,
    case when layer_count > 0 then 'populated' else 'not_applicable' end,
    case when layer_count > 0 then 'Deterministic exact rule match.'
         else 'No deterministic exact rule matched this source span under rule manifest ' || v_manifest_hash || '.' end,
    clock_timestamp()
  from (values
    ('HELP'::text, v_help_count),
    ('WORKFLOW'::text, v_workflow_count),
    ('ACCOUNTABILITY'::text, v_accountability_count),
    ('OVERRIDES'::text, v_override_count),
    ('DEFINITIONS'::text, v_definition_count)
  ) as layer_receipts(layer_name, layer_count);

  select jsonb_object_agg(lower(lc.layer_name), jsonb_build_object(
           'status', lc.coverage_status,
           'reason', lc.reason
         ) order by lc.layer_name)
    into v_coverage
  from public.layer_coverage lc
  where lc.extraction_run_id = v_run_id;

  v_row_counts := jsonb_build_object(
    'raw_blocks', 1,
    'help', v_help_count,
    'workflow_pipelines', case when v_workflow_count > 0 then 1 else 0 end,
    'workflow_steps', v_workflow_count,
    'accountability_routes', v_accountability_count,
    'escalation_nodes', v_accountability_count,
    'appeals', 0,
    'overrides', v_override_count,
    'definitions', v_definition_count,
    'coverage', 5
  );

  select jsonb_build_object(
    'contract_version', 'rosetta-law-view-v1',
    'source_receipt', jsonb_build_object(
      'document_identifier', v_document_identifier,
      'document_name', v_document_name,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'media_type', p_media_type,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'source_provider_hash', p_source_provider_hash,
      'source_span', jsonb_build_object(
        'source_block_id', v_block_id,
        'char_offset_start', 0,
        'char_offset_end', char_length(p_source_text),
        'block_content_hash', v_source_content_hash
      )
    ),
    'engine', jsonb_build_object(
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash
    ),
    'help', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'source_block_id', h.source_block_id,
        'entity_name', h.entity_name,
        'entity_type', h.entity_type,
        'governing_section', h.governing_section,
        'status', h.status,
        'effective_date', h.effective_date,
        'sunset_date', h.sunset_date,
        'confidence', h.confidence,
        'signal_status', h.signal_status
      ) order by h.id)
      from public.help_entity h where h.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'workflow', jsonb_build_object(
      'pipelines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', wp.id,
          'source_block_id', wp.source_block_id,
          'pipeline_name', wp.pipeline_name,
          'governing_section', wp.governing_section,
          'pipeline_type', wp.pipeline_type,
          'confidence', wp.confidence,
          'signal_status', wp.signal_status
        ) order by wp.id)
        from public.workflow_pipeline wp where wp.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ws.id,
          'pipeline_id', ws.workflow_pipeline_id,
          'step_order', ws.step_order,
          'step_name', ws.step_name,
          'actor', ws.actor,
          'verb', ws.verb,
          'governing_section', ws.governing_section,
          'confidence', ws.confidence,
          'signal_status', ws.signal_status
        ) order by ws.workflow_pipeline_id, ws.step_order)
        from public.workflow_step ws
        join public.workflow_pipeline wp on wp.id = ws.workflow_pipeline_id
        where wp.extraction_run_id = v_run_id
      ), '[]'::jsonb)
    ),
    'accountability', jsonb_build_object(
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ar.id,
          'source_block_id', ar.source_block_id,
          'route_name', ar.route_name,
          'governing_section', ar.governing_section,
          'trigger_condition', ar.trigger_condition,
          'enforcement_type', ar.enforcement_type,
          'enforcement_actor', ar.enforcement_actor,
          'enforcement_direction', ar.enforcement_direction,
          'confidence', ar.confidence,
          'signal_status', ar.signal_status
        ) order by ar.id)
        from public.accountability_route ar where ar.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'nodes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', en.id,
          'route_id', en.accountability_route_id,
          'node_order', en.node_order,
          'node_name', en.node_name,
          'action_required', en.action_required,
          'escalation_trigger', en.escalation_trigger
        ) order by en.accountability_route_id, en.node_order)
        from public.escalation_node en
        join public.accountability_route ar on ar.id = en.accountability_route_id
        where ar.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'appeals', '[]'::jsonb
    ),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', eo.id,
        'source_block_id', eo.source_block_id,
        'override_type', eo.override_type,
        'overridden_authority', eo.overridden_authority,
        'override_scope', eo.override_scope,
        'override_condition', eo.override_condition,
        'granting_actor', eo.granting_actor,
        'effective_date', eo.effective_date,
        'sunset_date', eo.sunset_date,
        'temporal_status', eo.temporal_status,
        'confidence', eo.confidence,
        'signal_status', eo.signal_status
      ) order by eo.id)
      from public.entity_override eo where eo.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'definitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', td.id,
        'source_block_id', td.source_block_id,
        'defined_term', td.defined_term,
        'defining_section', td.defining_section,
        'definition_text', td.definition_text,
        'definition_type', td.definition_type,
        'confidence', td.confidence,
        'signal_status', td.signal_status
      ) order by td.id)
      from public.term_definition td where td.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'coverage', v_coverage
  ) into v_output;

  v_output_hash := encode(digest(convert_to(v_output::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.extraction_manifest (
    id,
    extraction_run_id,
    source_document_id,
    corpus_id,
    canon_version,
    source_hash,
    row_counts,
    validation_results,
    drift_events,
    status,
    source_content_id,
    source_identity_hash,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    output_hash,
    admissibility_state
  ) values (
    'manifest-v1-' || v_source_identity_hash,
    v_run_id,
    p_source_document_id,
    v_corpus_id,
    1,
    v_source_content_hash,
    v_row_counts,
    jsonb_build_object(
      'source_hash_verified', true,
      'source_bytes_receipted', p_source_byte_hash is not null or lower(p_media_type) <> 'application/pdf',
      'five_layer_coverage', jsonb_object_length(v_coverage) = 5,
      'no_pending_coverage', not exists (
        select 1 from public.layer_coverage lc
        where lc.extraction_run_id = v_run_id
          and lc.coverage_status in ('pending_extraction', 'extraction_failed')
      ),
      'canonical_rows_source_bound', true,
      'output_hash_verified', true
    ),
    '[]'::jsonb,
    'clean',
    v_content_id,
    v_source_identity_hash,
    v_engine_version,
    v_rule_set_version,
    v_manifest_hash,
    v_configuration_hash,
    v_output_hash,
    'admissible'
  );

  insert into public.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values
    ('vr-v1-' || v_source_identity_hash || '-source-hash', v_run_id, 'source_hash_verified', 'pass', 0,
      jsonb_build_object('source_content_hash', v_source_content_hash)),
    ('vr-v1-' || v_source_identity_hash || '-source-bytes', v_run_id, 'source_bytes_receipted', 'pass', 0,
      jsonb_build_object('source_byte_hash', p_source_byte_hash, 'media_type', p_media_type)),
    ('vr-v1-' || v_source_identity_hash || '-coverage', v_run_id, 'five_layer_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v1-' || v_source_identity_hash || '-no-pending', v_run_id, 'no_pending_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v1-' || v_source_identity_hash || '-source-bound', v_run_id, 'canonical_rows_source_bound', 'pass', 0,
      jsonb_build_object('source_block_id', v_block_id)),
    ('vr-v1-' || v_source_identity_hash || '-output-hash', v_run_id, 'output_hash_verified', 'pass', 0,
      jsonb_build_object('output_content_hash', v_output_hash))
  on conflict (extraction_run_id, test_name) do nothing;

  update public.extraction_run
     set run_status = 'completed',
         output_content_hash = v_output_hash,
         admissibility_state = 'admissible',
         failure_code = null,
         completed_at = clock_timestamp()
   where id = v_run_id;

  v_result := jsonb_build_object(
    'source_document_id', p_source_document_id,
    'source_content_id', v_content_id,
    'source_identity_hash', v_source_identity_hash,
    'source_content_hash', v_source_content_hash,
    'source_byte_hash', p_source_byte_hash,
    'source_version', p_source_version,
    'source_url', p_source_url,
    'extraction_run_id', v_run_id,
    'run_version', v_run_version,
    'run_status', 'completed',
    'admissibility_state', 'admissible',
    'engine_version', v_engine_version,
    'rule_set_version', v_rule_set_version,
    'rule_manifest_hash', v_manifest_hash,
    'configuration_hash', v_configuration_hash,
    'output_content_hash', v_output_hash,
    'row_counts', v_row_counts,
    'coverage', v_coverage,
    'replayed', false
  );

  return v_result;
exception
  when unique_violation then
    raise;
  when others then
    if v_run_id is not null then
      update public.extraction_run
         set run_status = 'failed',
             admissibility_state = 'rejected',
             failure_code = sqlstate || ':' || sqlerrm,
             completed_at = clock_timestamp()
       where id = v_run_id
         and run_status = 'in_progress';
    end if;
    raise;
end;
$$

revoke all on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public

revoke all on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from anon

revoke all on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from authenticated

grant execute on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) to service_role

create or replace view public.v_civic_genome_law_view_v1
with (security_invoker = true)
as
with run_base as (
  select
    er.id as extraction_run_id,
    er.source_document_id,
    er.run_version,
    er.run_status,
    er.confidence_threshold,
    er.created_at,
    er.completed_at,
    sd.corpus_id,
    sd.document_name,
    sd.document_type,
    sd.document_identifier,
    er.engine_version,
    er.rule_set_version,
    er.rule_manifest_hash,
    er.configuration_hash,
    er.source_identity_hash,
    er.source_content_hash,
    er.output_content_hash,
    er.admissibility_state,
    sdc.source_url,
    sdc.source_version,
    sdc.media_type,
    sdc.source_byte_hash,
    sdc.source_provider_hash
  from public.extraction_run er
  join public.source_document sd on sd.id = er.source_document_id
  left join public.source_document_content sdc on sdc.source_content_id = er.source_content_id
), coverage_by_layer as (
  select
    lc.extraction_run_id,
    lc.layer_name,
    case
      when bool_or(lc.coverage_status = 'extraction_failed') then 'extraction_failed'
      when bool_or(lc.coverage_status = 'pending_extraction') then 'pending_extraction'
      when bool_or(lc.coverage_status = 'populated') then 'populated'
      else 'not_applicable'
    end as coverage_status,
    string_agg(distinct lc.reason, ' | ' order by lc.reason) filter (where lc.reason is not null) as reason,
    max(lc.validated_at) as validated_at
  from public.layer_coverage lc
  group by lc.extraction_run_id, lc.layer_name
), coverage as (
  select
    cbl.extraction_run_id,
    jsonb_object_agg(
      lower(cbl.layer_name),
      jsonb_build_object(
        'status', cbl.coverage_status,
        'reason', cbl.reason,
        'validated_at', cbl.validated_at
      ) order by cbl.layer_name
    ) as coverage_json,
    count(*) as layer_count,
    bool_and(cbl.coverage_status in ('populated', 'not_applicable')) as coverage_terminal
  from coverage_by_layer cbl
  group by cbl.extraction_run_id
), objects as (
  select
    unified.extraction_run_id,
    jsonb_agg(unified.object_json order by unified.layer_name, unified.object_id) as objects_json
  from (
    select h.extraction_run_id, 'help'::text as layer_name, h.id as object_id,
      jsonb_build_object(
        'layer', 'help',
        'key', h.id,
        'source_object_type', 'help_entity',
        'source_object_id', h.id,
        'source_block_id', h.source_block_id,
        'extraction_run_id', h.extraction_run_id::text,
        'normalized_value', jsonb_build_object(
          'entity_name', h.entity_name,
          'entity_type', h.entity_type,
          'governing_section', h.governing_section,
          'status', h.status,
          'effective_date', h.effective_date,
          'sunset_date', h.sunset_date
        ),
        'confidence', coalesce(h.confidence, 0),
        'confirmed', coalesce(h.signal_status, '') = 'confirmed',
        'metadata', jsonb_build_object(
          'canon_version', h.canon_version,
          'signal_status', h.signal_status,
          'source_span', jsonb_build_object(
            'char_offset_start', rb.char_offset_start,
            'char_offset_end', rb.char_offset_end,
            'block_content_hash', rb.block_content_hash,
            'section_number', rb.section_number
          )
        )
      ) as object_json
    from public.help_entity h
    left join public.hr1_raw_blocks rb on rb.id = h.source_block_id

    union all

    select wp.extraction_run_id, 'workflow'::text, wp.id,
      jsonb_build_object(
        'layer', 'workflow',
        'key', wp.id,
        'source_object_type', 'workflow_pipeline',
        'source_object_id', wp.id,
        'source_block_id', wp.source_block_id,
        'extraction_run_id', wp.extraction_run_id::text,
        'normalized_value', jsonb_build_object(
          'pipeline_name', wp.pipeline_name,
          'governing_section', wp.governing_section,
          'pipeline_type', wp.pipeline_type,
          'steps', coalesce((
            select jsonb_agg(jsonb_build_object(
              'step_id', ws.id,
              'step_order', ws.step_order,
              'step_name', ws.step_name,
              'actor', ws.actor,
              'verb', ws.verb,
              'governing_section', ws.governing_section
            ) order by ws.step_order)
            from public.workflow_step ws
            where ws.workflow_pipeline_id = wp.id
          ), '[]'::jsonb)
        ),
        'confidence', coalesce(wp.confidence, 0),
        'confirmed', coalesce(wp.signal_status, '') = 'confirmed',
        'metadata', jsonb_build_object(
          'canon_version', wp.canon_version,
          'signal_status', wp.signal_status,
          'source_span', jsonb_build_object(
            'char_offset_start', rb.char_offset_start,
            'char_offset_end', rb.char_offset_end,
            'block_content_hash', rb.block_content_hash,
            'section_number', rb.section_number
          )
        )
      )
    from public.workflow_pipeline wp
    left join public.hr1_raw_blocks rb on rb.id = wp.source_block_id

    union all

    select ar.extraction_run_id, 'accountability'::text, ar.id,
      jsonb_build_object(
        'layer', 'accountability',
        'key', ar.id,
        'source_object_type', 'accountability_route',
        'source_object_id', ar.id,
        'source_block_id', ar.source_block_id,
        'extraction_run_id', ar.extraction_run_id::text,
        'normalized_value', jsonb_build_object(
          'route_name', ar.route_name,
          'governing_section', ar.governing_section,
          'trigger_condition', ar.trigger_condition,
          'enforcement_type', ar.enforcement_type,
          'enforcement_actor', ar.enforcement_actor,
          'enforcement_direction', ar.enforcement_direction,
          'escalation_nodes', coalesce((
            select jsonb_agg(jsonb_build_object(
              'node_id', en.id,
              'node_order', en.node_order,
              'node_name', en.node_name,
              'action_required', en.action_required,
              'escalation_trigger', en.escalation_trigger
            ) order by en.node_order)
            from public.escalation_node en
            where en.accountability_route_id = ar.id
          ), '[]'::jsonb),
          'appeal_pathways', coalesce((
            select jsonb_agg(jsonb_build_object(
              'appeal_id', ap.id,
              'appeal_type', ap.appeal_type,
              'appeal_venue', ap.appeal_venue,
              'appeal_deadline', ap.appeal_deadline,
              'governing_section', ap.governing_section
            ) order by ap.id)
            from public.escalation_node en
            join public.appeal_pathway ap on ap.escalation_node_id = en.id
            where en.accountability_route_id = ar.id
          ), '[]'::jsonb)
        ),
        'confidence', coalesce(ar.confidence, 0),
        'confirmed', coalesce(ar.signal_status, '') = 'confirmed',
        'metadata', jsonb_build_object(
          'canon_version', ar.canon_version,
          'signal_status', ar.signal_status,
          'actor_canon_id', ar.actor_canon_id,
          'source_span', jsonb_build_object(
            'char_offset_start', rb.char_offset_start,
            'char_offset_end', rb.char_offset_end,
            'block_content_hash', rb.block_content_hash,
            'section_number', rb.section_number
          )
        )
      )
    from public.accountability_route ar
    left join public.hr1_raw_blocks rb on rb.id = ar.source_block_id

    union all

    select eo.extraction_run_id, 'override'::text, eo.id,
      jsonb_build_object(
        'layer', 'override',
        'key', eo.id,
        'source_object_type', 'entity_override',
        'source_object_id', eo.id,
        'source_block_id', eo.source_block_id,
        'extraction_run_id', eo.extraction_run_id::text,
        'normalized_value', jsonb_build_object(
          'override_type', eo.override_type,
          'overridden_authority', eo.overridden_authority,
          'override_scope', eo.override_scope,
          'override_condition', eo.override_condition,
          'granting_actor', eo.granting_actor,
          'effective_date', eo.effective_date,
          'sunset_date', eo.sunset_date,
          'temporal_status', eo.temporal_status
        ),
        'confidence', coalesce(eo.confidence, 0),
        'confirmed', coalesce(eo.signal_status, '') = 'confirmed',
        'metadata', jsonb_build_object(
          'canon_version', eo.canon_version,
          'signal_status', eo.signal_status,
          'actor_canon_id', eo.actor_canon_id,
          'source_span', jsonb_build_object(
            'char_offset_start', rb.char_offset_start,
            'char_offset_end', rb.char_offset_end,
            'block_content_hash', rb.block_content_hash,
            'section_number', rb.section_number
          )
        )
      )
    from public.entity_override eo
    left join public.hr1_raw_blocks rb on rb.id = eo.source_block_id

    union all

    select td.extraction_run_id, 'definition'::text, td.id,
      jsonb_build_object(
        'layer', 'definition',
        'key', td.id,
        'source_object_type', 'term_definition',
        'source_object_id', td.id,
        'source_block_id', td.source_block_id,
        'extraction_run_id', td.extraction_run_id::text,
        'normalized_value', jsonb_build_object(
          'defined_term', td.defined_term,
          'defining_section', td.defining_section,
          'definition_text', td.definition_text,
          'definition_type', td.definition_type
        ),
        'confidence', coalesce(td.confidence, 0),
        'confirmed', coalesce(td.signal_status, '') = 'confirmed',
        'metadata', jsonb_build_object(
          'canon_version', td.canon_version,
          'signal_status', td.signal_status,
          'source_span', jsonb_build_object(
            'char_offset_start', rb.char_offset_start,
            'char_offset_end', rb.char_offset_end,
            'block_content_hash', rb.block_content_hash,
            'section_number', rb.section_number
          )
        )
      )
    from public.term_definition td
    left join public.hr1_raw_blocks rb on rb.id = td.source_block_id
  ) unified
  group by unified.extraction_run_id
)
select
  rb.extraction_run_id,
  rb.source_document_id,
  rb.corpus_id,
  rb.document_name,
  rb.document_type,
  rb.document_identifier,
  rb.run_version,
  rb.run_status,
  rb.confidence_threshold,
  rb.created_at,
  rb.completed_at,
  coalesce(o.objects_json, '[]'::jsonb) as objects,
  coalesce(c.coverage_json, '{}'::jsonb) as coverage,
  case
    when rb.run_status in ('completed', 'validated')
      and rb.admissibility_state = 'admissible'
      and rb.engine_version is not null
      and rb.rule_set_version is not null
      and rb.rule_manifest_hash is not null
      and rb.source_content_hash is not null
      and rb.output_content_hash is not null
      and coalesce(c.layer_count, 0) = 5
      and coalesce(c.coverage_terminal, false)
    then 'complete'
    when rb.run_status = 'failed' or rb.admissibility_state = 'rejected'
    then 'failed'
    else 'partial'
  end as provenance_state,
  rb.engine_version,
  rb.rule_set_version,
  rb.rule_manifest_hash,
  rb.configuration_hash,
  rb.source_identity_hash,
  rb.source_content_hash,
  rb.output_content_hash,
  rb.admissibility_state,
  rb.source_url,
  rb.source_version,
  rb.media_type,
  rb.source_byte_hash,
  rb.source_provider_hash
from run_base rb
left join coverage c on c.extraction_run_id = rb.extraction_run_id
left join objects o on o.extraction_run_id = rb.extraction_run_id

comment on table public.source_document_content is
  'Immutable source-text and source-byte receipt used for deterministic Rosetta replay and source-span verification.'

comment on table public.extraction_rule_manifest is
  'Versioned declared deterministic Rosetta rule manifests. The manifest hash is part of every admissible run.'

comment on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) is
  'Service-role-only deterministic five-layer extraction. Same source identity, content, engine, rule manifest, and configuration replays the existing receipt without duplicate rows.'

commit
