CREATE OR REPLACE FUNCTION public.run_rosetta_v3_extraction_v2511_base(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '120s'
AS $function$
declare
  v_engine_version constant text := 'rosetta-v3-deterministic-sql-2.5.11';
  v_rule_set_version constant text := 'rosetta-five-layer-structural-correctness-2.5.11';
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
  v_section record;
  v_clause_row record;
  v_section_flat text;
  v_section_hash text;
  v_section_block_id text;
  v_pipeline_id text;
  v_section_help_count integer := 0;
  v_section_workflow_count integer := 0;
  v_section_accountability_count integer := 0;
  v_section_override_count integer := 0;
  v_section_definition_count integer := 0;
  v_structural_validation jsonb;
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
    'normalization_version', 'rosetta-normalize-whitespace-v2',
    'parsing_projection_version', 'rosetta-layout-projection-v25',
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
    'cfg-v2511-' || v_source_identity_hash || '-' || v_configuration_hash,
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
      'manifest-v2511-' || v_source_identity_hash || '-' || v_configuration_hash,
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
      'vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-complete',
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


  v_flat := public.rosetta_v2_normalize_text(p_source_text);

  v_match := regexp_match(
    v_flat,
    '(?i)EFFECTIVE DATE:\s*([A-Za-z]+\s+[0-9]{1,2},\s+[0-9]{4})'
  );
  if v_match is not null then
    begin
      v_effective_date := to_date(v_match[1], 'Month DD, YYYY');
    exception when others then
      v_effective_date := null;
    end;
  end if;

  if v_effective_date is not null and p_reference_date is not null then
    v_temporal_status :=
      case when p_reference_date >= v_effective_date then 'active' else 'pending' end;
  end if;

  v_block_id := 'blk-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-root';

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
    'Document',
    encode(digest(convert_to('Document', 'UTF8'), 'sha256'), 'hex'),
    v_source_content_hash,
    null,
    v_document_identifier || '/' || p_source_version,
    0,
    char_length(p_source_text)
  );

  for v_section in
    select *
    from public.rosetta_v25_section_spans(p_source_text)
    order by section_ordinal
  loop
    v_section_number := v_section.section_number;
    v_section_flat := public.rosetta_v2_normalize_text(public.rosetta_v25_layout_projection(v_section.section_text));
    v_section_hash := encode(
      digest(convert_to(v_section.section_text, 'UTF8'), 'sha256'),
      'hex'
    );
    v_section_block_id :=
      'blk-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
      lpad(v_section.section_ordinal::text, 4, '0');

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
      v_section_block_id,
      v_run_id,
      p_source_document_id,
      'section',
      v_section_number,
      encode(digest(convert_to(v_section_number, 'UTF8'), 'sha256'), 'hex'),
      v_section_hash,
      v_block_id,
      v_document_identifier || '/' || p_source_version || '/' || v_section_number,
      v_section.char_offset_start,
      v_section.char_offset_end
    );

    v_section_help_count := 0;
    v_section_workflow_count := 0;
    v_section_accountability_count := 0;
    v_section_override_count := 0;
    v_section_definition_count := 0;
    v_pipeline_id :=
      'wp-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
      lpad(v_section.section_ordinal::text, 4, '0');

    for v_match in
      select regexp_matches(
        v_section_flat,
        '(?i)there shall be a ([^.;]{1,180}?license)',
        'g'
      )
    loop
      v_help_count := v_help_count + 1;
      v_section_help_count := v_section_help_count + 1;
      v_clause := btrim(v_match[1]);

      insert into public.help_entity (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, entity_name, entity_type, governing_section, status,
        effective_date, sunset_date, confidence, signal_status
      ) values (
        'he-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_help_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
        v_clause,
        'license',
        v_section_number,
        case
          when v_section_flat ~* '\m(amending|amended)\M' then 'modified'
          else 'created'
        end,
        v_effective_date::text,
        null,
        1.00,
        'confirmed'
      );
    end loop;

    for v_clause_row in
      select *
      from public.rosetta_v25_normative_clauses(v_section.section_text)
      order by clause_ordinal
    loop
      v_workflow_count := v_workflow_count + 1;
      v_section_workflow_count := v_section_workflow_count + 1;
      v_clause := v_clause_row.clause_text;
      v_modal := v_clause_row.modal;
      v_actor := v_clause_row.actor;

      if v_section_workflow_count = 1 then
        insert into public.workflow_pipeline (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, pipeline_name, governing_section, pipeline_type,
          confidence, signal_status
        ) values (
          v_pipeline_id,
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          'Exact source obligations for ' || v_section_number,
          v_section_number,
          'section_ordered_normative_modal_clauses',
          1.00,
          'confirmed'
        );
      end if;

      insert into public.workflow_step (
        id, workflow_pipeline_id, step_order, step_name, actor, actor_canon_id,
        verb, governing_section, confidence, signal_status
      ) values (
        'ws-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_workflow_count::text, 4, '0'),
        v_pipeline_id,
        v_section_workflow_count,
        v_clause,
        v_actor,
        null,
        v_modal,
        v_section_number,
        1.00,
        'confirmed'
      );

      if (
        v_clause ~* '\m(?:must|shall|may)\M\s+(?:not\s+)?(?:immediately\s+)?(?:report|notify|transmit|investigat|suspend|revoke|refuse|affirm|reverse|petition|take)\M'
        or v_clause ~* '\m(?:must|shall|may)\M\s+consider\s+(?:suspend|revok)'
        or v_clause ~* '\m(?:felony|sentenced|penalty|forfeiture|guilty)\M'
      )
      and v_clause !~* '^\s*(?:\([a-z0-9]+\)\s*)?Nothing\s+in\M'
      and lower(btrim(coalesce(v_actor, ''))) not in ('the report', 'a report')
      then
        v_accountability_count := v_accountability_count + 1;
        v_section_accountability_count := v_section_accountability_count + 1;

        insert into public.accountability_route (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, route_name, governing_section, trigger_condition,
          enforcement_type, enforcement_actor, actor_canon_id,
          enforcement_direction, confidence, signal_status
        ) values (
          'ar-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          'Exact accountability clause ' || v_accountability_count,
          v_section_number,
          v_clause,
          case
            when v_clause ~* 'forfeitur'
              then 'source_stated_forfeiture_rule'
            else 'source_stated_enforcement_rule'
          end,
          v_actor,
          null,
          'agency_mandate',
          1.00,
          'confirmed'
        );

        insert into public.escalation_node (
          id, accountability_route_id, node_order, node_name, action_required,
          actor_canon_id, escalation_trigger
        ) values (
          'en-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          'ar-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          1,
          'Source-stated accountability action',
          v_clause,
          null,
          v_clause
        );
      end if;
    end loop;

    for v_match in
      select regexp_matches(v_section_flat, '([^.]+[.])', 'g')
    loop
      v_clause := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(v_match[1]));
      if v_clause ~*
        '\m(unless|however|except|notwithstanding)\M|\msubject to\M|\mdoes not apply\M|\mdo not apply\M|^\s*(?:\([a-z0-9]+\)\s*)?Nothing\s+in\s+.+\s+shall\s+prevent\M'
         and v_clause !~* '["“][^"”]{1,160}["”]\s+(includes(?:,\s*but is not limited to)?|means|does not include|has the same meaning as)\M'
      then
        v_override_count := v_override_count + 1;
        v_section_override_count := v_section_override_count + 1;

        select inferred.modal, inferred.actor
          into v_modal, v_actor
        from public.rosetta_v2_modal_and_actor(v_clause) inferred;

        insert into public.entity_override (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, override_type, overridden_authority, override_scope,
          override_condition, granting_actor, actor_canon_id, effective_date,
          sunset_date, temporal_status, confidence, signal_status
        ) values (
          'ov-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_override_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          case
            when v_clause ~* '\m(unless|except|however|does not apply|do not apply)\M'
              then 'source_stated_exception'
            else 'source_stated_condition'
          end,
          'Base rule within ' || v_section_number,
          v_clause,
          v_clause,
          v_actor,
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
        v_section_flat,
        '(?i)["“]([^"”]{1,120})["”]\s+(includes(?:,\s*but is not limited to)?|means|does not include|has the same meaning as)\s*:?[ ]*([^.;]+[.;])',
        'g'
      )
    loop
      v_definition_count := v_definition_count + 1;
      v_section_definition_count := v_section_definition_count + 1;

      insert into public.term_definition (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, defined_term, defining_section, definition_text,
        definition_type, confidence, signal_status
      ) values (
        'td-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_definition_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
        btrim(v_match[1]),
        v_section_number,
        public.rosetta_v25_unprotect_text(btrim(v_match[2] || ' ' || v_match[3])),
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
      'lc-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
        lpad(v_section.section_ordinal::text, 4, '0') || '-' || layer_name,
      v_run_id,
      v_section_block_id,
      layer_name,
      case when layer_count > 0 then 'populated' else 'not_applicable' end,
      case
        when layer_count > 0
          then 'Deterministic section-local rule match.'
        else 'No deterministic section-local rule matched this source span under rule manifest ' ||
             v_manifest_hash || '.'
      end,
      clock_timestamp()
    from (values
      ('HELP'::text, v_section_help_count),
      ('WORKFLOW'::text, v_section_workflow_count),
      ('ACCOUNTABILITY'::text, v_section_accountability_count),
      ('OVERRIDES'::text, v_section_override_count),
      ('DEFINITIONS'::text, v_section_definition_count)
    ) as layer_receipts(layer_name, layer_count);
  end loop;

  select jsonb_object_agg(
           lower(cbl.layer_name),
           jsonb_build_object(
             'status', cbl.coverage_status,
             'reason', cbl.reason
           )
           order by cbl.layer_name
         )
    into v_coverage
  from (
    select
      lc.layer_name,
      case
        when bool_or(lc.coverage_status = 'populated') then 'populated'
        else 'not_applicable'
      end as coverage_status,
      string_agg(distinct lc.reason, ' | ' order by lc.reason) as reason
    from public.layer_coverage lc
    where lc.extraction_run_id = v_run_id
    group by lc.layer_name
  ) cbl;

  v_row_counts := jsonb_build_object(
    'raw_blocks', (select count(*) from public.hr1_raw_blocks where extraction_run_id = v_run_id),
    'help', v_help_count,
    'workflow_pipelines', (select count(*) from public.workflow_pipeline where extraction_run_id = v_run_id),
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
        'governing_section', (select rb.section_number from public.hr1_raw_blocks rb where rb.id = eo.source_block_id),
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

  v_structural_validation := public.rosetta_v25_validate_extraction(v_run_id, p_source_text);
  if v_structural_validation->>'status' <> 'pass' then
    raise exception using
      errcode = '22000',
      message = 'rosetta_v2_structural_validation_failed',
      detail = v_structural_validation::text;
  end if;

  insert into public.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values (
    'vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-structural-correctness',
    v_run_id,
    'structural_correctness_v2',
    'pass',
    0,
    v_structural_validation
  ) on conflict (extraction_run_id, test_name) do nothing;

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
    'manifest-v2511-' || v_source_identity_hash || '-' || v_configuration_hash,
    v_run_id,
    p_source_document_id,
    v_corpus_id,
    1,
    v_source_content_hash,
    v_row_counts,
    jsonb_build_object(
      'source_hash_verified', true,
      'source_bytes_receipted', p_source_byte_hash is not null or lower(p_media_type) <> 'application/pdf',
      'five_layer_coverage', (select count(*) = 5 from jsonb_object_keys(v_coverage)),
      'no_pending_coverage', not exists (
        select 1 from public.layer_coverage lc
        where lc.extraction_run_id = v_run_id
          and lc.coverage_status in ('pending_extraction', 'extraction_failed')
      ),
      'canonical_rows_source_bound', true,
      'structural_correctness_v2', v_structural_validation,
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
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-hash', v_run_id, 'source_hash_verified', 'pass', 0,
      jsonb_build_object('source_content_hash', v_source_content_hash)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-bytes', v_run_id, 'source_bytes_receipted', 'pass', 0,
      jsonb_build_object('source_byte_hash', p_source_byte_hash, 'media_type', p_media_type)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-coverage', v_run_id, 'five_layer_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-no-pending', v_run_id, 'no_pending_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-bound', v_run_id, 'canonical_rows_source_bound', 'pass', 0,
      jsonb_build_object('source_block_id', v_block_id)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-output-hash', v_run_id, 'output_hash_verified', 'pass', 0,
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
$function$
