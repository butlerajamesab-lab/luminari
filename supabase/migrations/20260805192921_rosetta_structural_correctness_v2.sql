begin

do $migration$
declare
  v_sql text;
  v_backup_sql text;
  v_declaration_anchor text := '  v_result jsonb;';
  v_core_start integer;
  v_core_end integer;
  v_structural_anchor integer;
  v_new_core text := $core$
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

  v_block_id := 'blk-v2-' || v_source_identity_hash || '-root';

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
    from public.rosetta_v2_section_spans(p_source_text)
    order by section_ordinal
  loop
    v_section_number := v_section.section_number;
    v_section_flat := public.rosetta_v2_normalize_text(v_section.section_text);
    v_section_hash := encode(
      digest(convert_to(v_section.section_text, 'UTF8'), 'sha256'),
      'hex'
    );
    v_section_block_id :=
      'blk-v2-' || v_source_identity_hash || '-' ||
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
      'wp-v2-' || v_source_identity_hash || '-' ||
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
        'he-v2-' || v_source_identity_hash || '-' ||
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
      from public.rosetta_v2_normative_clauses(v_section.section_text)
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
        'ws-v2-' || v_source_identity_hash || '-' ||
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

      if v_clause ~* '(forfeitur|penalt|violat|offense|enforc|appeal|review)' then
        v_accountability_count := v_accountability_count + 1;
        v_section_accountability_count := v_section_accountability_count + 1;

        insert into public.accountability_route (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, route_name, governing_section, trigger_condition,
          enforcement_type, enforcement_actor, actor_canon_id,
          enforcement_direction, confidence, signal_status
        ) values (
          'ar-v2-' || v_source_identity_hash || '-' ||
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
          'en-v2-' || v_source_identity_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          'ar-v2-' || v_source_identity_hash || '-' ||
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
      select regexp_matches(v_section_flat, '([^.;]+[.;])', 'g')
    loop
      v_clause := public.rosetta_v2_normalize_text(v_match[1]);
      if v_clause ~*
        '\m(unless|however|except|notwithstanding)\M|\mmay not\M|\mshall not\M|\mmust not\M|\msubject to\M'
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
          'ov-v2-' || v_source_identity_hash || '-' ||
            lpad(v_override_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          case
            when v_clause ~* '\m(unless|except|however)\M'
              then 'source_stated_exception'
            when v_clause ~* '\m(may not|shall not|must not)\M'
              then 'source_stated_limitation'
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
        'td-v2-' || v_source_identity_hash || '-' ||
          lpad(v_definition_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
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
      'lc-v2-' || v_source_identity_hash || '-' ||
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

$core$;
begin
  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  )
  into v_sql;

  if v_sql is null then
    raise exception 'run_rosetta_v3_extraction definition not found';
  end if;

  if to_regprocedure(
    'public.run_rosetta_v3_extraction_v1_legacy(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ) is null then
    v_backup_sql := replace(
      v_sql,
      'FUNCTION public.run_rosetta_v3_extraction(',
      'FUNCTION public.run_rosetta_v3_extraction_v1_legacy('
    );
    if v_backup_sql = v_sql then
      raise exception 'unable to create v1 extraction backup';
    end if;
    execute v_backup_sql;
  end if;

  if strpos(v_sql, v_declaration_anchor) = 0 then
    raise exception 'v_result declaration anchor missing';
  end if;

  v_sql := replace(
    v_sql,
    v_declaration_anchor,
    v_declaration_anchor || E'\n' ||
    '  v_section record;' || E'\n' ||
    '  v_clause_row record;' || E'\n' ||
    '  v_section_flat text;' || E'\n' ||
    '  v_section_hash text;' || E'\n' ||
    '  v_section_block_id text;' || E'\n' ||
    '  v_pipeline_id text;' || E'\n' ||
    '  v_section_help_count integer := 0;' || E'\n' ||
    '  v_section_workflow_count integer := 0;' || E'\n' ||
    '  v_section_accountability_count integer := 0;' || E'\n' ||
    '  v_section_override_count integer := 0;' || E'\n' ||
    '  v_section_definition_count integer := 0;' || E'\n' ||
    '  v_structural_validation jsonb;'
  );

  v_sql := replace(
    v_sql,
    'rosetta-v3-deterministic-sql-1.0.0',
    'rosetta-v3-deterministic-sql-2.0.0'
  );
  v_sql := replace(
    v_sql,
    'rosetta-five-layer-exact-patterns-1.0.0',
    'rosetta-five-layer-structural-correctness-2.0.0'
  );
  v_sql := replace(
    v_sql,
    'rosetta-normalize-whitespace-v1',
    'rosetta-normalize-whitespace-v2'
  );

  foreach v_declaration_anchor in array array[
    'cfg-v1-',
    'manifest-v1-',
    'vr-v1-'
  ]
  loop
    v_sql := replace(
      v_sql,
      v_declaration_anchor,
      replace(v_declaration_anchor, '-v1-', '-v2-')
    );
  end loop;

  v_core_start := strpos(v_sql, '  v_flat := btrim(regexp_replace(');
  if v_core_start = 0 then
    raise exception 'legacy extraction core start anchor missing';
  end if;

  v_core_end :=
    v_core_start - 1 +
    strpos(
      substr(v_sql, v_core_start),
      '  v_row_counts := jsonb_build_object('
    );
  if v_core_end <= v_core_start then
    raise exception 'legacy extraction core end anchor missing';
  end if;

  v_sql := overlay(
    v_sql
    placing v_new_core
    from v_core_start
    for v_core_end - v_core_start
  );

  v_sql := replace(
    v_sql,
    '''raw_blocks'', 1,',
    '''raw_blocks'', (select count(*) from public.hr1_raw_blocks where extraction_run_id = v_run_id),'
  );
  v_sql := replace(
    v_sql,
    '''workflow_pipelines'', case when v_workflow_count > 0 then 1 else 0 end,',
    '''workflow_pipelines'', (select count(*) from public.workflow_pipeline where extraction_run_id = v_run_id),'
  );

  v_structural_anchor :=
    v_core_start - 1 +
    strpos(
      substr(v_sql, v_core_start),
      '  insert into public.extraction_manifest ('
    );
  if v_structural_anchor <= v_core_start then
    raise exception 'manifest insertion anchor missing';
  end if;

  v_sql := overlay(
    v_sql
    placing
      '  v_structural_validation := public.rosetta_v2_validate_extraction(v_run_id, p_source_text);' || E'\n' ||
      '  if v_structural_validation->>''status'' <> ''pass'' then' || E'\n' ||
      '    raise exception using' || E'\n' ||
      '      errcode = ''22000'',' || E'\n' ||
      '      message = ''rosetta_v2_structural_validation_failed'',' || E'\n' ||
      '      detail = v_structural_validation::text;' || E'\n' ||
      '  end if;' || E'\n\n' ||
      '  insert into public.validation_result (' || E'\n' ||
      '    id, extraction_run_id, test_name, test_result, failure_count, details' || E'\n' ||
      '  ) values (' || E'\n' ||
      '    ''vr-v2-'' || v_source_identity_hash || ''-structural-correctness'',' || E'\n' ||
      '    v_run_id,' || E'\n' ||
      '    ''structural_correctness_v2'',' || E'\n' ||
      '    ''pass'',' || E'\n' ||
      '    0,' || E'\n' ||
      '    v_structural_validation' || E'\n' ||
      '  ) on conflict (extraction_run_id, test_name) do nothing;' || E'\n\n' ||
      '  insert into public.extraction_manifest ('
    from v_structural_anchor
    for char_length('  insert into public.extraction_manifest (')
  );

  v_sql := replace(
    v_sql,
    '''canonical_rows_source_bound'', true,',
    '''canonical_rows_source_bound'', true,' || E'\n' ||
    '      ''structural_correctness_v2'', v_structural_validation,'
  );

  execute v_sql;
end;
$migration$

alter function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) set statement_timeout = '120s'

alter function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) set search_path = pg_catalog, public, extensions

revoke all on function public.run_rosetta_v3_extraction_v1_legacy(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) from public, anon, authenticated

grant execute on function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) to service_role

comment on function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) is
  'Service-owned deterministic Rosetta V3 extraction. Version 2.0.0 binds every object to its actual section, preserves compound modal polarity and explicit modal prefixes, excludes declared legislative findings from workflow, validates complete section-local coverage, and retains immutable v1 receipts.'

commit
