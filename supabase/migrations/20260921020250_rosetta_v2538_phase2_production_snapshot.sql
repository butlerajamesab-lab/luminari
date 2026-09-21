-- ============================================================================
-- Rosetta v2.5.38 Phase 2 production snapshot
-- Captured from the live ROSETTA database after Phase 2 certification.
-- This file intentionally preserves the live routine definitions rather than
-- reconstructing them from an earlier draft.
--
-- Security posture:
--   phase2_execution_status is owner-only under RLS.
--   No anon/authenticated/service_role table grants or permissive policies are
--   created here because no verified application consumer currently requires
--   direct access.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rosetta_v2513.phase2_execution_status (
  extraction_run_id integer PRIMARY KEY,
  status text NOT NULL,
  resolved_queue_items integer DEFAULT 0,
  receipt jsonb,
  started_at timestamptz DEFAULT clock_timestamp(),
  finished_at timestamptz,
  error_message text
);

ALTER TABLE rosetta_v2513.phase2_execution_status ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE rosetta_v2513.phase2_execution_status
  FROM anon, authenticated, service_role;

-- rosetta_v2513.run_v2538_phase2_heavy_runs()
CREATE OR REPLACE PROCEDURE rosetta_v2513.run_v2538_phase2_heavy_runs()
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_lock_key CONSTANT BIGINT := 25382538;
  v_run_id INT;
  v_receipt JSONB;
  v_resolved_count INT;
  v_runs INT[] := ARRAY[1001912, 1002113, 1013068, 1004131, 1012065];
  v_run_failed BOOLEAN;
  v_err_msg TEXT;
BEGIN
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RAISE NOTICE 'Phase 2 driver is already actively running in another backend. Exiting cleanly.';
    RETURN;
  END IF;

  FOREACH v_run_id IN ARRAY v_runs
  LOOP
    IF EXISTS (
      SELECT 1 FROM rosetta_v2513.phase2_execution_status 
      WHERE extraction_run_id = v_run_id AND status = 'completed'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO rosetta_v2513.phase2_execution_status (extraction_run_id, status, started_at)
    VALUES (v_run_id, 'running', clock_timestamp())
    ON CONFLICT (extraction_run_id) 
    DO UPDATE SET status = 'running', started_at = clock_timestamp(), error_message = NULL;
    
    COMMIT;

    v_run_failed := FALSE;
    v_err_msg := NULL;
    v_resolved_count := 0;
    v_receipt := NULL;

    BEGIN
      v_receipt := rosetta_v2513.v2538_rosetta_v25_refresh_object_source_spans(v_run_id);

      WITH newly_resolved AS (
        UPDATE rosetta_v2513.rosetta_structural_repair_queue rq
        SET 
          repair_state = 'resolved',
          resolved_at  = clock_timestamp()
        FROM rosetta_v2513.rosetta_object_source_span ros
        WHERE rq.extraction_run_id = v_run_id
          AND rq.object_id = ros.object_id
          AND ros.span_status = 'resolved'
          AND rq.repair_state IN ('open', 'in_review')
        RETURNING rq.repair_id
      )
      SELECT COUNT(*) INTO v_resolved_count FROM newly_resolved;

    EXCEPTION WHEN OTHERS THEN
      v_run_failed := TRUE;
      v_err_msg := SQLERRM;
    END;

    IF v_run_failed THEN
      UPDATE rosetta_v2513.phase2_execution_status
      SET 
        status = 'failed',
        finished_at = clock_timestamp(),
        error_message = v_err_msg
      WHERE extraction_run_id = v_run_id;
    ELSE
      UPDATE rosetta_v2513.phase2_execution_status
      SET 
        status = 'completed',
        resolved_queue_items = v_resolved_count,
        receipt = v_receipt,
        finished_at = clock_timestamp()
      WHERE extraction_run_id = v_run_id;
    END IF;

    COMMIT;

  END LOOP;

  PERFORM pg_advisory_unlock(v_lock_key);

END;
$procedure$

-- rosetta_v2513.v2538_build_projection_receipt(text,text)
CREATE OR REPLACE FUNCTION rosetta_v2513.v2538_build_projection_receipt(p_raw_text text, p_projected_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_raw_len int;
    v_proj_len int;
    v_raw_nonws int;
    v_proj_nonws int;
    v_masked_char_count int;
    v_raw_sha text;
    v_proj_sha text;
BEGIN
    v_raw_len  := char_length(p_raw_text);
    v_proj_len := char_length(p_projected_text);

    -- Invariant 1: Strict coordinate length preservation
    IF v_raw_len <> v_proj_len THEN
        RAISE EXCEPTION USING 
            ERRCODE = '22023',
            MESSAGE = format('projection_length_invariant_failed: raw=%s projected=%s', v_raw_len, v_proj_len);
    END IF;

    -- Invariant 2: Non-whitespace monotonicity
    v_raw_nonws  := char_length(translate(p_raw_text, E' \n\r\t', ''));
    v_proj_nonws := char_length(translate(p_projected_text, E' \n\r\t', ''));

    IF v_proj_nonws > v_raw_nonws THEN
        RAISE EXCEPTION USING 
            ERRCODE = '22023',
            MESSAGE = format('projection_nonwhitespace_invariant_failed: raw_nonws=%s proj_nonws=%s', v_raw_nonws, v_proj_nonws);
    END IF;

    v_masked_char_count := v_raw_nonws - v_proj_nonws;
    v_raw_sha  := encode(digest(convert_to(p_raw_text, 'UTF8'), 'sha256'), 'hex');
    v_proj_sha := encode(digest(convert_to(p_projected_text, 'UTF8'), 'sha256'), 'hex');

    -- Exact rosetta-projection-receipt-v1 contract
    RETURN jsonb_build_object(
        'contract', 'rosetta-projection-receipt-v1',
        'raw_sha256', v_raw_sha,
        'projected_sha256', v_proj_sha,
        'projection_method', 'masking-projection',
        'projection_version', 'rosetta-layout-projection-v2533',
        'offset_mapping_status', 'not_preserved_declared',
        'offset_mapping', NULL,
        'excluded_regions', jsonb_build_object(
            'masked_char_count', v_masked_char_count,
            'method', 'position-diff of raw vs projected'
        ),
        'charset_receipt', jsonb_build_object(
            'source_charset', 'UTF8',
            'decoding_method', 'database text (already decoded)'
        )
    );
END;
$function$

-- rosetta_v2513.v2538_normative_clauses_from_projected_section(text,integer,text,integer)
CREATE OR REPLACE FUNCTION rosetta_v2513.v2538_normative_clauses_from_projected_section(p_projected_section_text text, p_section_ordinal integer, p_section_number text, p_base_char_offset integer)
 RETURNS TABLE(section_ordinal integer, section_number text, section_clause_ordinal integer, clause_text text, actor text, modal text, source_offset_start integer, source_offset_end integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_mapping_text text;
  v_normalized_projected_original text;
  v_regex_stream text;
  v_norm_start_map integer[];
  v_norm_end_map integer[];
  v_map_norm_pos integer;

  v_pattern text;
  v_match text[];
  v_match_pos integer;
  v_match_len integer;
  v_cursor integer;
  v_clause text;
  v_modal text;
  v_actor text;
  v_ordinal integer := 0;
  v_raw_loc_start integer;
  v_raw_loc_end integer;
BEGIN
  IF p_projected_section_text IS NULL THEN
    RETURN;
  END IF;

  v_mapping_text :=
    rosetta_v2513.v2537_rosetta_v25_unprotect_text(p_projected_section_text);
  v_normalized_projected_original :=
    rosetta_v2513.v2537_rosetta_v2_normalize_text(v_mapping_text);

  v_regex_stream :=
    rosetta_v2513.v2537_rosetta_v2_normalize_text(p_projected_section_text);

  IF char_length(v_regex_stream) <> char_length(v_normalized_projected_original) THEN
    RAISE EXCEPTION
      'Rosetta v2538 Stream Synchronization Failure: regex_stream length % <> mapping_stream length % in Section %',
      char_length(v_regex_stream),
      char_length(v_normalized_projected_original),
      p_section_number
      USING ERRCODE='P1S02';
  END IF;

  IF char_length(v_normalized_projected_original)=0 THEN
    RETURN;
  END IF;

  v_norm_start_map := array[]::integer[];
  v_norm_end_map := array[]::integer[];
  v_map_norm_pos := 0;

  WITH char_base AS MATERIALIZED (
    SELECT
      t.ch,
      t.ordinality::integer AS raw_pos,
      t.ch ~ '[[:space:]]' AS is_space
    FROM unnest(string_to_array(v_mapping_text,NULL))
      WITH ORDINALITY AS t(ch,ordinality)
  ),
  transitioned AS MATERIALIZED (
    SELECT
      c.*,
      lag(c.is_space) OVER (ORDER BY c.raw_pos) AS previous_is_space
    FROM char_base c
  ),
  grouped AS MATERIALIZED (
    SELECT
      t.*,
      sum(
        CASE
          WHEN t.previous_is_space IS DISTINCT FROM t.is_space THEN 1
          ELSE 0
        END
      ) OVER (ORDER BY t.raw_pos) AS run_id
    FROM transitioned t
  ),
  bounds AS MATERIALIZED (
    SELECT
      min(raw_pos) FILTER (WHERE NOT is_space) AS first_nonspace,
      max(raw_pos) FILTER (WHERE NOT is_space) AS last_nonspace
    FROM grouped
  ),
  whitespace_runs AS MATERIALIZED (
    SELECT
      run_id,
      min(raw_pos)::integer AS run_start,
      max(raw_pos)::integer AS run_end
    FROM grouped
    WHERE is_space
    GROUP BY run_id
  ),
  emitted AS (
    SELECT
      raw_pos AS sort_pos,
      raw_pos - 1 AS raw_start,
      raw_pos AS raw_end
    FROM grouped
    WHERE NOT is_space

    UNION ALL

    SELECT
      r.run_start,
      r.run_start - 1,
      r.run_end
    FROM whitespace_runs r
    CROSS JOIN bounds b
    WHERE r.run_start > b.first_nonspace
      AND r.run_end < b.last_nonspace
  )
  SELECT
    coalesce(array_agg(raw_start ORDER BY sort_pos),'{}'::integer[]),
    coalesce(array_agg(raw_end ORDER BY sort_pos),'{}'::integer[]),
    count(*)::integer
  INTO
    v_norm_start_map,
    v_norm_end_map,
    v_map_norm_pos
  FROM emitted;

  IF v_map_norm_pos IS DISTINCT FROM char_length(v_normalized_projected_original) THEN
    RAISE EXCEPTION
      'Rosetta v2538 Normalized span map length mismatch: mapped % vs actual % in Section %',
      v_map_norm_pos,
      char_length(v_normalized_projected_original),
      p_section_number
      USING ERRCODE='P1S01';
  END IF;

  v_cursor := 1;
  v_pattern := '(?i)([^.]*\m(shall not|must not|may not|shall|must|may)\M[^.]*[.])';

  FOR v_match IN
    SELECT regexp_matches(v_regex_stream,v_pattern,'g')
  LOOP
    v_match_len := char_length(v_match[1]);
    v_match_pos := strpos(substr(v_regex_stream,v_cursor),v_match[1]);

    IF v_match_pos > 0 THEN
      v_match_pos := v_cursor + v_match_pos - 1;
      v_cursor := v_match_pos + v_match_len;
    ELSE
      v_match_pos := strpos(v_regex_stream,v_match[1]);
    END IF;

    v_clause :=
      rosetta_v2513.v2537_rosetta_v25_unprotect_text(
        rosetta_v2513.v2537_rosetta_v2_normalize_text(v_match[1])
      );

    IF p_section_number ILIKE '%definition%'
       OR v_clause ~* '^\s*"[A-Z][^"]+"\s+means\M' THEN
      CONTINUE;
    END IF;

    SELECT inferred.modal,inferred.actor
    INTO v_modal,v_actor
    FROM rosetta_v2513.v2537_rosetta_v25_modal_and_actor(v_clause) inferred;

    IF v_actor IS NULL OR v_modal IS NULL THEN
      CONTINUE;
    END IF;

    IF v_clause ~* '^\s*(the\s+legislature|congress)\s+(finds|declares|recognizes)\M' THEN
      CONTINUE;
    END IF;

    IF NOT rosetta_v2513.v2537_rosetta_v25_clause_structurally_sound(
      v_clause,v_actor,v_modal
    ) THEN
      CONTINUE;
    END IF;

    v_ordinal := v_ordinal + 1;

    v_raw_loc_start := v_norm_start_map[v_match_pos];
    v_raw_loc_end := v_norm_end_map[v_match_pos + v_match_len - 1];

    section_ordinal := p_section_ordinal;
    section_number := p_section_number;
    section_clause_ordinal := v_ordinal;
    clause_text := v_clause;
    actor := v_actor;
    modal := v_modal;
    source_offset_start := p_base_char_offset + v_raw_loc_start;
    source_offset_end := p_base_char_offset + v_raw_loc_end;

    RETURN NEXT;
  END LOOP;
END;
$function$

-- rosetta_v2513.v2538_rosetta_v25_refresh_object_source_spans(integer)
CREATE OR REPLACE FUNCTION rosetta_v2513.v2538_rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_doc_id integer;
  v_content_id uuid;
  v_source_text text;
  v_working_text text;

  v_row record;

  v_t1_verified boolean;
  v_candidate_start integer;
  v_candidate_end integer;
  v_candidate_method text;
  v_t1_sec_start integer;
  v_t1_sec_end integer;
  v_t1_sec_num text;
  v_t1_proj_sec text;
  v_t1_proj_slice text;
  v_t1_slice_norm text;
  v_t1_raw_text text;

  v_recon_n integer;
  v_recon_k integer;
  v_recon_m integer;
  v_recon_start integer;
  v_recon_end integer;

  v_loc_start integer;
  v_loc_end integer;
  v_loc_status text;
  v_block_text text;
  v_absolute_start integer;
  v_absolute_end integer;
  v_raw_text text;
  v_needle text;
  v_source_count integer;
  v_object_count integer;
  v_object_ordinal integer;
  v_definition_only boolean;
  v_status text;
  v_cached_block_id text;
  v_projected_block text;
  v_normalized_projected_block text;
  v_projection_receipt jsonb;
  v_projection_verified boolean;
  v_block_raw_sha text;
  v_mapping_text text;
  v_normalized_projected_original text;
  v_normalized_needle text;
  v_norm_start_map integer[];
  v_norm_end_map integer[];
  v_map_norm_pos integer;
  v_target_occurrence integer;
  v_match_iteration integer;
  v_search integer;
  v_relative integer;
  v_match_start_norm integer;
  v_match_end_norm integer;

  v_last_block_id text := null;
  v_last_needle text := null;
  v_last_source_count integer := 0;
  v_last_match_pos integer := 0;
  v_match_pos integer := 0;
  v_second_pos integer := 0;
  v_match_positions integer[] := array[]::integer[];

  v_total integer := 0;
  v_tier1_direct integer := 0;
  v_tier1_reconstructed integer := 0;
  v_tier2_resolved integer := 0;
  v_ambiguous integer := 0;
  v_unresolved integer := 0;
BEGIN
  SELECT er.source_document_id, er.source_content_id, sdc.source_text
  INTO v_doc_id, v_content_id, v_source_text
  FROM rosetta_v2513.extraction_run er
  JOIN rosetta_v2513.source_document_content sdc
    ON sdc.source_content_id = er.source_content_id
  WHERE er.id = p_extraction_run_id;

  IF v_source_text IS NULL THEN
    RAISE EXCEPTION 'extraction run % has no bound source snapshot', p_extraction_run_id;
  END IF;

  v_working_text :=
    rosetta_v2513.v2538_rosetta_v25_strip_non_operative_headers_iso_v2(v_source_text);

  CREATE TEMP TABLE IF NOT EXISTS _v2538_run_sections (
    section_ordinal integer,
    section_number text,
    char_offset_start integer,
    char_offset_end integer,
    raw_sha256 text NOT NULL,
    section_text text NOT NULL,
    projected_section_text text NOT NULL,
    projection_receipt jsonb NOT NULL,
    projection_verified boolean NOT NULL,
    PRIMARY KEY (section_ordinal, char_offset_start)
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp._v2538_run_sections;

  WITH raw_sections AS MATERIALIZED (
    SELECT
      s.section_ordinal,
      s.section_number,
      s.char_offset_start,
      s.char_offset_end,
      s.section_text
    FROM rosetta_v2513.v2537_rosetta_v25_section_spans(v_working_text) s
  ),
  projected_sections AS MATERIALIZED (
    SELECT
      r.section_ordinal,
      r.section_number,
      r.char_offset_start,
      r.char_offset_end,
      r.section_text,
      rosetta_v2513.v2537_rosetta_v25_layout_projection(r.section_text)
        AS projected_section_text
    FROM raw_sections r
  )
  INSERT INTO pg_temp._v2538_run_sections(
    section_ordinal,
    section_number,
    char_offset_start,
    char_offset_end,
    raw_sha256,
    section_text,
    projected_section_text,
    projection_receipt,
    projection_verified
  )
  SELECT
    p.section_ordinal,
    p.section_number,
    p.char_offset_start,
    p.char_offset_end,
    encode(digest(convert_to(p.section_text,'UTF8'),'sha256'),'hex'),
    p.section_text,
    p.projected_section_text,
    rosetta_v2513.v2538_build_projection_receipt(
      p.section_text,
      p.projected_section_text
    ),
    rosetta_v2513.v2537_rosetta_v25_verify_projection(
      p.section_text,
      p.projected_section_text
    )
  FROM projected_sections p;

  CREATE INDEX IF NOT EXISTS _v2538_run_sections_raw_sha_idx
    ON pg_temp._v2538_run_sections(raw_sha256);

  CREATE INDEX IF NOT EXISTS _v2538_run_sections_bounds_idx
    ON pg_temp._v2538_run_sections(char_offset_start, char_offset_end);

  CREATE TEMP TABLE IF NOT EXISTS _v2538_run_clauses (
    section_ordinal integer,
    section_number text,
    clause_ordinal integer,
    clause_text text,
    actor text,
    modal text,
    source_offset_start integer,
    source_offset_end integer,
    norm_clause_text text
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp._v2538_run_clauses;

  INSERT INTO pg_temp._v2538_run_clauses(
    section_ordinal,
    section_number,
    clause_ordinal,
    clause_text,
    actor,
    modal,
    source_offset_start,
    source_offset_end,
    norm_clause_text
  )
  SELECT
    q.section_ordinal,
    q.section_number,
    row_number() OVER (
      ORDER BY q.section_ordinal,q.section_clause_ordinal
    )::integer,
    q.clause_text,
    q.actor,
    q.modal,
    q.source_offset_start,
    q.source_offset_end,
    rosetta_v2513.v2537_rosetta_v2_normalize_text(q.clause_text)
  FROM (
    SELECT
      c.section_ordinal,
      c.section_number,
      c.section_clause_ordinal,
      c.clause_text,
      c.actor,
      c.modal,
      c.source_offset_start,
      c.source_offset_end
    FROM pg_temp._v2538_run_sections s
    CROSS JOIN LATERAL
      rosetta_v2513.v2538_normative_clauses_from_projected_section(
        s.projected_section_text,
        s.section_ordinal,
        s.section_number,
        s.char_offset_start
      ) c
    WHERE s.section_number <> 'Preamble'
  ) q;

  CREATE INDEX IF NOT EXISTS _v2538_run_clauses_norm_idx
    ON pg_temp._v2538_run_clauses(norm_clause_text, clause_ordinal);

  CREATE TEMP TABLE IF NOT EXISTS _v2538_run_multiplicity (
    object_type text,
    object_id text,
    needle_mode text,
    object_count integer,
    object_ordinal integer,
    PRIMARY KEY (object_type, object_id, needle_mode)
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp._v2538_run_multiplicity;

  INSERT INTO pg_temp._v2538_run_multiplicity(
    object_type, object_id, needle_mode, object_count, object_ordinal
  )
  SELECT
    'workflow_step',
    ws.id,
    'full',
    count(*) OVER (
      PARTITION BY
        coalesce(ws.source_block_id, wp.source_block_id),
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ws.step_name))
    )::integer,
    row_number() OVER (
      PARTITION BY
        coalesce(ws.source_block_id, wp.source_block_id),
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ws.step_name))
      ORDER BY ws.id
    )::integer
  FROM rosetta_v2513.workflow_step ws
  JOIN rosetta_v2513.workflow_pipeline wp
    ON wp.id = ws.workflow_pipeline_id
  WHERE wp.extraction_run_id = p_extraction_run_id
    AND (ws.source_block_id IS NULL OR ws.source_block_id = wp.source_block_id)

  UNION ALL

  SELECT
    'accountability_route',
    ar.id,
    'full',
    count(*) OVER (
      PARTITION BY
        ar.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ar.trigger_condition))
    )::integer,
    row_number() OVER (
      PARTITION BY
        ar.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ar.trigger_condition))
      ORDER BY ar.id
    )::integer
  FROM rosetta_v2513.accountability_route ar
  WHERE ar.extraction_run_id = p_extraction_run_id

  UNION ALL

  SELECT
    'entity_override',
    eo.id,
    'full',
    count(*) OVER (
      PARTITION BY
        eo.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(eo.override_scope))
    )::integer,
    row_number() OVER (
      PARTITION BY
        eo.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(eo.override_scope))
      ORDER BY eo.id
    )::integer
  FROM rosetta_v2513.entity_override eo
  WHERE eo.extraction_run_id = p_extraction_run_id

  UNION ALL

  SELECT
    'help_entity',
    h.id,
    'full',
    count(*) OVER (
      PARTITION BY
        h.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(h.entity_name))
    )::integer,
    row_number() OVER (
      PARTITION BY
        h.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(h.entity_name))
      ORDER BY h.id
    )::integer
  FROM rosetta_v2513.help_entity h
  WHERE h.extraction_run_id = p_extraction_run_id

  UNION ALL

  SELECT
    'term_definition',
    td.id,
    'full',
    count(*) OVER (
      PARTITION BY
        td.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(
          '"' || td.defined_term || '" ' || td.definition_text
        ))
    )::integer,
    row_number() OVER (
      PARTITION BY
        td.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(
          '"' || td.defined_term || '" ' || td.definition_text
        ))
      ORDER BY td.id
    )::integer
  FROM rosetta_v2513.term_definition td
  WHERE td.extraction_run_id = p_extraction_run_id

  UNION ALL

  SELECT
    'term_definition',
    td.id,
    'definition_only',
    count(*) OVER (
      PARTITION BY
        td.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(td.definition_text))
    )::integer,
    row_number() OVER (
      PARTITION BY
        td.source_block_id,
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(td.definition_text))
      ORDER BY td.id
    )::integer
  FROM rosetta_v2513.term_definition td
  WHERE td.extraction_run_id = p_extraction_run_id;

  CREATE TEMP TABLE IF NOT EXISTS _v2538_run_candidates (
    source_block_id text NOT NULL,
    normalized_needle text NOT NULL,
    PRIMARY KEY (source_block_id, normalized_needle)
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp._v2538_run_candidates;

  INSERT INTO pg_temp._v2538_run_candidates(source_block_id, normalized_needle)
  SELECT DISTINCT x.source_block_id, x.normalized_needle
  FROM (
    SELECT
      coalesce(ws.source_block_id, wp.source_block_id) AS source_block_id,
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ws.step_name)) AS normalized_needle
    FROM rosetta_v2513.workflow_step ws
    JOIN rosetta_v2513.workflow_pipeline wp ON wp.id = ws.workflow_pipeline_id
    WHERE wp.extraction_run_id = p_extraction_run_id

    UNION ALL
    SELECT ar.source_block_id,
           lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ar.trigger_condition))
    FROM rosetta_v2513.accountability_route ar
    WHERE ar.extraction_run_id = p_extraction_run_id

    UNION ALL
    SELECT eo.source_block_id,
           lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(eo.override_scope))
    FROM rosetta_v2513.entity_override eo
    WHERE eo.extraction_run_id = p_extraction_run_id

    UNION ALL
    SELECT h.source_block_id,
           lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(h.entity_name))
    FROM rosetta_v2513.help_entity h
    WHERE h.extraction_run_id = p_extraction_run_id

    UNION ALL
    SELECT td.source_block_id,
           lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(
             '"' || td.defined_term || '" ' || td.definition_text
           ))
    FROM rosetta_v2513.term_definition td
    WHERE td.extraction_run_id = p_extraction_run_id

    UNION ALL
    SELECT td.source_block_id,
           lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(td.definition_text))
    FROM rosetta_v2513.term_definition td
    WHERE td.extraction_run_id = p_extraction_run_id
  ) x
  WHERE x.source_block_id IS NOT NULL
    AND nullif(x.normalized_needle,'') IS NOT NULL;

  CREATE TEMP TABLE IF NOT EXISTS _v2538_block_needle_index (
    normalized_needle text PRIMARY KEY,
    occurrence_count integer NOT NULL,
    match_positions integer[] NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp._v2538_block_needle_index;

  DELETE FROM rosetta_v2513.rosetta_object_source_span
  WHERE extraction_run_id = p_extraction_run_id;

  FOR v_row IN
    SELECT
      'workflow_step'::text AS object_type,
      ws.id AS object_id,
      wp.source_document_id,
      coalesce(ws.source_block_id, wp.source_block_id) AS source_block_id,
      rb.char_offset_start AS block_start,
      rb.char_offset_end AS block_end,
      ws.step_name AS needle,
      ws.source_offset_start AS direct_start,
      ws.source_offset_end AS direct_end,
      ws.provenance_type,
      ws.step_order AS sort_order,
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ws.step_name)) AS normalized_needle
    FROM rosetta_v2513.workflow_step ws
    JOIN rosetta_v2513.workflow_pipeline wp
      ON wp.id = ws.workflow_pipeline_id
    JOIN rosetta_v2513.hr1_raw_blocks rb
      ON rb.id = coalesce(ws.source_block_id, wp.source_block_id)
    WHERE wp.extraction_run_id = p_extraction_run_id

    UNION ALL

    SELECT
      'accountability_route', ar.id, ar.source_document_id, ar.source_block_id,
      rb.char_offset_start, rb.char_offset_end, ar.trigger_condition,
      NULL::integer, NULL::integer, NULL::text, 0,
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(ar.trigger_condition))
    FROM rosetta_v2513.accountability_route ar
    JOIN rosetta_v2513.hr1_raw_blocks rb ON rb.id = ar.source_block_id
    WHERE ar.extraction_run_id = p_extraction_run_id

    UNION ALL

    SELECT
      'entity_override', eo.id, eo.source_document_id, eo.source_block_id,
      rb.char_offset_start, rb.char_offset_end, eo.override_scope,
      NULL::integer, NULL::integer, NULL::text, 0,
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(eo.override_scope))
    FROM rosetta_v2513.entity_override eo
    JOIN rosetta_v2513.hr1_raw_blocks rb ON rb.id = eo.source_block_id
    WHERE eo.extraction_run_id = p_extraction_run_id

    UNION ALL

    SELECT
      'term_definition', td.id, td.source_document_id, td.source_block_id,
      rb.char_offset_start, rb.char_offset_end,
      '"' || td.defined_term || '" ' || td.definition_text,
      NULL::integer, NULL::integer, NULL::text, 0,
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(
        '"' || td.defined_term || '" ' || td.definition_text
      ))
    FROM rosetta_v2513.term_definition td
    JOIN rosetta_v2513.hr1_raw_blocks rb ON rb.id = td.source_block_id
    WHERE td.extraction_run_id = p_extraction_run_id

    UNION ALL

    SELECT
      'help_entity', h.id, h.source_document_id, h.source_block_id,
      rb.char_offset_start, rb.char_offset_end, h.entity_name,
      NULL::integer, NULL::integer, NULL::text, 0,
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(h.entity_name))
    FROM rosetta_v2513.help_entity h
    JOIN rosetta_v2513.hr1_raw_blocks rb ON rb.id = h.source_block_id
    WHERE h.extraction_run_id = p_extraction_run_id

    ORDER BY source_block_id, normalized_needle, object_type, object_id
  LOOP
    v_total := v_total + 1;
    v_t1_verified := false;
    v_candidate_start := null;
    v_candidate_end := null;
    v_candidate_method := null;
    v_t1_sec_start := null;
    v_t1_sec_end := null;
    v_t1_sec_num := null;
    v_t1_proj_sec := null;
    v_t1_proj_slice := null;
    v_t1_slice_norm := null;
    v_t1_raw_text := null;

    v_needle := v_row.needle;

    IF v_row.object_type = 'workflow_step'
       AND v_row.direct_start IS NOT NULL
       AND v_row.direct_end IS NOT NULL THEN
      v_candidate_start := v_row.direct_start;
      v_candidate_end := v_row.direct_end;
      v_candidate_method := 'provenance_direct_v2538';

    ELSIF v_row.object_type = 'workflow_step'
      AND EXISTS (
        SELECT 1
        FROM rosetta_v2513.rosetta_structural_repair_queue rq
        WHERE rq.object_id = v_row.object_id
          AND rq.extraction_run_id = p_extraction_run_id
          AND rq.defect_type = 'source_span_ambiguous'
          AND rq.object_type = 'workflow_step'
          AND rq.repair_state IN ('open','in_review','resolved')
      ) THEN

      SELECT q.n_run, q.k_run
      INTO v_recon_n, v_recon_k
      FROM (
        SELECT
          ws.id,
          count(*) OVER ()::integer AS n_run,
          row_number() OVER (ORDER BY ws.step_order, ws.id)::integer AS k_run
        FROM rosetta_v2513.workflow_step ws
        JOIN rosetta_v2513.workflow_pipeline wp
          ON wp.id = ws.workflow_pipeline_id
        WHERE wp.extraction_run_id = p_extraction_run_id
          AND rosetta_v2513.v2537_rosetta_v2_normalize_text(ws.step_name)
              = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_row.needle)
      ) q
      WHERE q.id = v_row.object_id;

      WITH matches AS MATERIALIZED (
        SELECT
          nc.clause_ordinal,
          nc.source_offset_start,
          nc.source_offset_end,
          row_number() OVER (ORDER BY nc.clause_ordinal)::integer AS seq,
          count(*) OVER ()::integer AS m_run
        FROM pg_temp._v2538_run_clauses nc
        WHERE nc.norm_clause_text
              = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_row.needle)
      )
      SELECT
        max(m_run),
        max(source_offset_start) FILTER (WHERE seq = v_recon_k),
        max(source_offset_end) FILTER (WHERE seq = v_recon_k)
      INTO v_recon_m, v_recon_start, v_recon_end
      FROM matches;

      IF v_recon_n IS NOT NULL
         AND v_recon_m IS NOT NULL
         AND v_recon_n = v_recon_m
         AND v_recon_start IS NOT NULL
         AND v_recon_end IS NOT NULL THEN
        v_candidate_start := v_recon_start;
        v_candidate_end := v_recon_end;
        v_candidate_method := 'runbound_reconstructed_v2538';
      END IF;
    END IF;

    IF v_candidate_start IS NOT NULL AND v_candidate_end IS NOT NULL THEN
      SELECT
        s.char_offset_start,
        s.char_offset_end,
        s.section_number,
        s.projected_section_text
      INTO
        v_t1_sec_start,
        v_t1_sec_end,
        v_t1_sec_num,
        v_t1_proj_sec
      FROM pg_temp._v2538_run_sections s
      WHERE v_candidate_start >= s.char_offset_start
        AND v_candidate_end <= s.char_offset_end
      ORDER BY
        (s.char_offset_end - s.char_offset_start) ASC,
        s.section_ordinal ASC
      LIMIT 1;

      IF v_t1_proj_sec IS NOT NULL THEN
        v_t1_proj_slice := substr(
          v_t1_proj_sec,
          (v_candidate_start - v_t1_sec_start) + 1,
          v_candidate_end - v_candidate_start
        );

        v_t1_slice_norm :=
          rosetta_v2513.v2537_rosetta_v2_normalize_text(
            rosetta_v2513.v2537_rosetta_v25_unprotect_text(v_t1_proj_slice)
          );

        IF v_t1_slice_norm =
           rosetta_v2513.v2537_rosetta_v2_normalize_text(v_row.needle) THEN
          v_t1_verified := true;
          v_t1_raw_text := substr(
            v_source_text,
            v_candidate_start + 1,
            v_candidate_end - v_candidate_start
          );

          INSERT INTO rosetta_v2513.projection_receipt(
            extraction_run_id, object_type, object_id,
            raw_sha256, projected_sha256,
            projection_method, projection_version,
            offset_mapping, offset_mapping_status,
            charset_receipt, excluded_regions, verified
          ) VALUES (
            p_extraction_run_id,
            v_row.object_type,
            v_row.object_id,
            encode(digest(convert_to(v_t1_raw_text,'UTF8'),'sha256'),'hex'),
            encode(digest(convert_to(v_t1_proj_slice,'UTF8'),'sha256'),'hex'),
            v_candidate_method,
            CASE WHEN v_candidate_method='provenance_direct_v2538'
                 THEN 'v2.5.38_direct'
                 ELSE 'v2.5.38_runbound_reconstructed' END,
            jsonb_build_object(
              'absolute_start', v_candidate_start,
              'absolute_end', v_candidate_end,
              'parent_section', v_t1_sec_num,
              'parent_start', v_t1_sec_start,
              'parent_end', v_t1_sec_end,
              'relative_start', v_candidate_start - v_t1_sec_start,
              'relative_end', v_candidate_end - v_t1_sec_start
            ),
            'preserved',
            jsonb_build_object('encoding','UTF8'),
            '[]'::jsonb,
            true
          );

          INSERT INTO rosetta_v2513.rosetta_object_source_span(
            object_type, object_id, extraction_run_id,
            source_document_id, source_block_id,
            source_offset_start, source_offset_end,
            raw_text, normalized_text, raw_text_hash,
            projection_version, span_status
          ) VALUES (
            v_row.object_type,
            v_row.object_id,
            p_extraction_run_id,
            v_doc_id,
            v_row.source_block_id,
            v_candidate_start,
            v_candidate_end,
            v_t1_raw_text,
            v_row.needle,
            encode(digest(convert_to(v_t1_raw_text,'UTF8'),'sha256'),'hex'),
            CASE WHEN v_candidate_method='provenance_direct_v2538'
                 THEN 'v2.5.38_direct'
                 ELSE 'v2.5.38_runbound_reconstructed' END,
            'resolved'
          )
          ON CONFLICT(object_type,object_id) DO UPDATE SET
            extraction_run_id = excluded.extraction_run_id,
            source_document_id = excluded.source_document_id,
            source_block_id = excluded.source_block_id,
            source_offset_start = excluded.source_offset_start,
            source_offset_end = excluded.source_offset_end,
            raw_text = excluded.raw_text,
            normalized_text = excluded.normalized_text,
            raw_text_hash = excluded.raw_text_hash,
            projection_version = excluded.projection_version,
            span_status = excluded.span_status,
            created_at = now();

          IF v_candidate_method = 'provenance_direct_v2538' THEN
            v_tier1_direct := v_tier1_direct + 1;
          ELSE
            v_tier1_reconstructed := v_tier1_reconstructed + 1;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_t1_verified THEN
      CONTINUE;
    END IF;

    v_definition_only := false;
    v_block_text := substr(
      v_source_text,
      v_row.block_start + 1,
      v_row.block_end - v_row.block_start
    );

    IF v_cached_block_id IS DISTINCT FROM v_row.source_block_id::text THEN
      v_block_raw_sha :=
        encode(digest(convert_to(v_block_text,'UTF8'),'sha256'),'hex');

      v_projected_block := null;
      v_projection_receipt := null;
      v_projection_verified := null;

      SELECT
        s.projected_section_text,
        s.projection_receipt,
        s.projection_verified
      INTO
        v_projected_block,
        v_projection_receipt,
        v_projection_verified
      FROM pg_temp._v2538_run_sections s
      WHERE s.char_offset_start = v_row.block_start
        AND s.char_offset_end = v_row.block_end
        AND s.raw_sha256 = v_block_raw_sha
      ORDER BY s.section_ordinal
      LIMIT 1;

      IF v_projected_block IS NULL THEN
        v_projected_block :=
          rosetta_v2513.v2537_rosetta_v25_layout_projection(v_block_text);
        v_projection_receipt :=
          rosetta_v2513.v2538_build_projection_receipt(
            v_block_text,
            v_projected_block
          );
        v_projection_verified :=
          rosetta_v2513.v2537_rosetta_v25_verify_projection(
            v_block_text,
            v_projected_block
          );
      END IF;

      v_mapping_text :=
        rosetta_v2513.v2537_rosetta_v25_unprotect_text(v_projected_block);
      v_normalized_projected_original :=
        rosetta_v2513.v2537_rosetta_v2_normalize_text(v_mapping_text);
      v_normalized_projected_block := lower(v_normalized_projected_original);

      v_norm_start_map := array[]::integer[];
      v_norm_end_map := array[]::integer[];
      v_map_norm_pos := 0;

      IF char_length(v_mapping_text) > 0 THEN
        WITH char_base AS MATERIALIZED (
          SELECT
            t.ch,
            t.ordinality::integer AS raw_pos,
            t.ch ~ '[[:space:]]' AS is_space
          FROM unnest(string_to_array(v_mapping_text,NULL))
            WITH ORDINALITY AS t(ch,ordinality)
        ),
        transitioned AS MATERIALIZED (
          SELECT
            c.*,
            lag(c.is_space) OVER (ORDER BY c.raw_pos) AS previous_is_space
          FROM char_base c
        ),
        grouped AS MATERIALIZED (
          SELECT
            t.*,
            sum(
              CASE
                WHEN t.previous_is_space IS DISTINCT FROM t.is_space THEN 1
                ELSE 0
              END
            ) OVER (ORDER BY t.raw_pos) AS run_id
          FROM transitioned t
        ),
        bounds AS MATERIALIZED (
          SELECT
            min(raw_pos) FILTER (WHERE NOT is_space) AS first_nonspace,
            max(raw_pos) FILTER (WHERE NOT is_space) AS last_nonspace
          FROM grouped
        ),
        whitespace_runs AS MATERIALIZED (
          SELECT
            run_id,
            min(raw_pos)::integer AS run_start,
            max(raw_pos)::integer AS run_end
          FROM grouped
          WHERE is_space
          GROUP BY run_id
        ),
        emitted AS (
          SELECT raw_pos AS sort_pos, raw_pos-1 AS raw_start, raw_pos AS raw_end
          FROM grouped
          WHERE NOT is_space

          UNION ALL

          SELECT r.run_start, r.run_start-1, r.run_end
          FROM whitespace_runs r
          CROSS JOIN bounds b
          WHERE r.run_start > b.first_nonspace
            AND r.run_end < b.last_nonspace
        )
        SELECT
          coalesce(array_agg(raw_start ORDER BY sort_pos),'{}'::integer[]),
          coalesce(array_agg(raw_end ORDER BY sort_pos),'{}'::integer[]),
          count(*)::integer
        INTO
          v_norm_start_map,
          v_norm_end_map,
          v_map_norm_pos
        FROM emitted;
      END IF;

      IF v_map_norm_pos IS DISTINCT FROM
         char_length(v_normalized_projected_original) THEN
        RAISE EXCEPTION 'normalized span map length mismatch: % / %',
          v_map_norm_pos, char_length(v_normalized_projected_original)
          USING ERRCODE='P1S01';
      END IF;

      TRUNCATE TABLE pg_temp._v2538_block_needle_index;

      WITH RECURSIVE
      block_needles AS MATERIALIZED (
        SELECT c.normalized_needle
        FROM pg_temp._v2538_run_candidates c
        WHERE c.source_block_id = v_row.source_block_id::text
      ),
      needle_search AS (
        SELECT
          b.normalized_needle,
          1::integer AS match_ordinal,
          first_hit.match_pos::integer AS match_pos,
          char_length(b.normalized_needle)::integer AS needle_len
        FROM block_needles b
        CROSS JOIN LATERAL (
          SELECT strpos(v_normalized_projected_block,b.normalized_needle)::integer AS match_pos
        ) first_hit
        WHERE first_hit.match_pos > 0

        UNION ALL

        SELECT
          s.normalized_needle,
          s.match_ordinal + 1,
          (s.match_pos + s.needle_len - 1 + next_hit.relative_pos)::integer,
          s.needle_len
        FROM needle_search s
        CROSS JOIN LATERAL (
          SELECT strpos(
            substr(v_normalized_projected_block,s.match_pos+s.needle_len),
            s.normalized_needle
          )::integer AS relative_pos
        ) next_hit
        WHERE s.match_pos + s.needle_len <= char_length(v_normalized_projected_block)
          AND next_hit.relative_pos > 0
          AND s.match_ordinal < 1000
      ),
      aggregated AS MATERIALIZED (
        SELECT
          ns.normalized_needle,
          count(*)::integer AS occurrence_count,
          array_agg(ns.match_pos ORDER BY ns.match_ordinal)::integer[] AS match_positions
        FROM needle_search ns
        GROUP BY ns.normalized_needle
      )
      INSERT INTO pg_temp._v2538_block_needle_index(
        normalized_needle, occurrence_count, match_positions
      )
      SELECT
        b.normalized_needle,
        coalesce(a.occurrence_count,0),
        coalesce(a.match_positions,array[]::integer[])
      FROM block_needles b
      LEFT JOIN aggregated a ON a.normalized_needle=b.normalized_needle;

      IF EXISTS (
        SELECT 1
        FROM pg_temp._v2538_block_needle_index bi
        WHERE bi.occurrence_count=1000
          AND strpos(
            substr(
              v_normalized_projected_block,
              bi.match_positions[1000] + char_length(bi.normalized_needle)
            ),
            bi.normalized_needle
          ) > 0
      ) THEN
        RAISE EXCEPTION
          'v2538 block needle occurrence cap exceeded for block %',
          v_row.source_block_id
          USING ERRCODE='P1S02';
      END IF;

      v_cached_block_id := v_row.source_block_id::text;
    END IF;

    v_normalized_needle :=
      lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle));

    SELECT bi.occurrence_count, bi.match_positions
    INTO v_source_count, v_match_positions
    FROM pg_temp._v2538_block_needle_index bi
    WHERE bi.normalized_needle = v_normalized_needle;

    v_source_count := coalesce(v_source_count,0);
    v_match_positions := coalesce(v_match_positions,array[]::integer[]);

    IF v_row.object_type='term_definition' AND v_source_count=0 THEN
      SELECT td.definition_text
      INTO v_needle
      FROM rosetta_v2513.term_definition td
      WHERE td.id = v_row.object_id;

      v_definition_only := true;
      v_normalized_needle :=
        lower(rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle));

      SELECT bi.occurrence_count, bi.match_positions
      INTO v_source_count, v_match_positions
      FROM pg_temp._v2538_block_needle_index bi
      WHERE bi.normalized_needle = v_normalized_needle;

      v_source_count := coalesce(v_source_count,0);
      v_match_positions := coalesce(v_match_positions,array[]::integer[]);
    END IF;

    v_object_count := null;
    v_object_ordinal := null;

    SELECT m.object_count, m.object_ordinal
    INTO v_object_count, v_object_ordinal
    FROM pg_temp._v2538_run_multiplicity m
    WHERE m.object_type = v_row.object_type
      AND m.object_id = v_row.object_id
      AND m.needle_mode = CASE
        WHEN v_row.object_type='term_definition' AND v_definition_only
          THEN 'definition_only'
        ELSE 'full'
      END;

    IF v_object_count IS NULL THEN
      IF v_row.object_type='workflow_step' THEN
        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE ws.id <= v_row.object_id)::integer
        INTO v_object_count, v_object_ordinal
        FROM rosetta_v2513.workflow_step ws
        JOIN rosetta_v2513.workflow_pipeline wp
          ON wp.id = ws.workflow_pipeline_id
        WHERE wp.extraction_run_id = p_extraction_run_id
          AND wp.source_block_id = v_row.source_block_id
          AND rosetta_v2513.v2537_rosetta_v2_normalize_text(ws.step_name)
              = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle);
  
      ELSIF v_row.object_type='accountability_route' THEN
        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE ar.id <= v_row.object_id)::integer
        INTO v_object_count, v_object_ordinal
        FROM rosetta_v2513.accountability_route ar
        WHERE ar.extraction_run_id = p_extraction_run_id
          AND ar.source_block_id = v_row.source_block_id
          AND rosetta_v2513.v2537_rosetta_v2_normalize_text(ar.trigger_condition)
              = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle);
  
      ELSIF v_row.object_type='entity_override' THEN
        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE eo.id <= v_row.object_id)::integer
        INTO v_object_count, v_object_ordinal
        FROM rosetta_v2513.entity_override eo
        WHERE eo.extraction_run_id = p_extraction_run_id
          AND eo.source_block_id = v_row.source_block_id
          AND rosetta_v2513.v2537_rosetta_v2_normalize_text(eo.override_scope)
              = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle);
  
      ELSIF v_row.object_type='help_entity' THEN
        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE h.id <= v_row.object_id)::integer
        INTO v_object_count, v_object_ordinal
        FROM rosetta_v2513.help_entity h
        WHERE h.extraction_run_id = p_extraction_run_id
          AND h.source_block_id = v_row.source_block_id
          AND rosetta_v2513.v2537_rosetta_v2_normalize_text(h.entity_name)
              = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle);
  
      ELSE
        IF v_definition_only THEN
          SELECT
            count(*)::integer,
            count(*) FILTER (WHERE td.id <= v_row.object_id)::integer
          INTO v_object_count, v_object_ordinal
          FROM rosetta_v2513.term_definition td
          WHERE td.extraction_run_id = p_extraction_run_id
            AND td.source_block_id = v_row.source_block_id
            AND rosetta_v2513.v2537_rosetta_v2_normalize_text(td.definition_text)
                = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle);
        ELSE
          SELECT
            count(*)::integer,
            count(*) FILTER (WHERE td.id <= v_row.object_id)::integer
          INTO v_object_count, v_object_ordinal
          FROM rosetta_v2513.term_definition td
          WHERE td.extraction_run_id = p_extraction_run_id
            AND td.source_block_id = v_row.source_block_id
            AND rosetta_v2513.v2537_rosetta_v2_normalize_text(
                  '"' || td.defined_term || '" ' || td.definition_text
                )
                = rosetta_v2513.v2537_rosetta_v2_normalize_text(v_needle);
        END IF;
      END IF;
    END IF;

    v_loc_start := null;
    v_loc_end := null;
    v_loc_status := null;

    IF v_source_count > 0 THEN
      v_target_occurrence := CASE
        WHEN v_source_count = v_object_count THEN v_object_ordinal
        ELSE 1
      END;

      v_match_start_norm := CASE
        WHEN v_target_occurrence BETWEEN 1
             AND coalesce(array_length(v_match_positions,1),0)
          THEN v_match_positions[v_target_occurrence]
        ELSE null
      END;

      IF v_match_start_norm IS NOT NULL THEN
        v_match_end_norm :=
          v_match_start_norm + char_length(v_normalized_needle) - 1;

        IF v_match_start_norm BETWEEN 1
             AND coalesce(array_length(v_norm_start_map,1),0)
           AND v_match_end_norm BETWEEN 1
             AND coalesce(array_length(v_norm_end_map,1),0) THEN
          v_loc_start := v_norm_start_map[v_match_start_norm];
          v_loc_end := v_norm_end_map[v_match_end_norm];

          IF v_loc_start IS NOT NULL
             AND v_loc_end IS NOT NULL
             AND v_loc_end > v_loc_start THEN
            v_loc_status := 'resolved';
          END IF;
        END IF;
      END IF;

      IF v_source_count = v_object_count THEN
        v_status := coalesce(v_loc_status,'unresolved');
      ELSE
        v_status := CASE
          WHEN v_loc_status='resolved' THEN 'ambiguous'
          ELSE 'unresolved'
        END;
      END IF;
    ELSE
      v_status := 'unresolved';
    END IF;

    IF v_status IN ('resolved','ambiguous')
       AND v_loc_start IS NOT NULL THEN
      v_absolute_start := v_row.block_start + v_loc_start;
      v_absolute_end := v_row.block_start + v_loc_end;
      v_raw_text := substr(
        v_source_text,
        v_absolute_start + 1,
        v_absolute_end - v_absolute_start
      );
    ELSE
      v_absolute_start := null;
      v_absolute_end := null;
      v_raw_text := null;
    END IF;

    INSERT INTO rosetta_v2513.projection_receipt(
      extraction_run_id, object_type, object_id,
      raw_sha256, projected_sha256,
      projection_method, projection_version,
      offset_mapping, offset_mapping_status,
      charset_receipt, excluded_regions, verified
    ) VALUES (
      p_extraction_run_id,
      v_row.object_type,
      v_row.object_id::text,
      v_projection_receipt->>'raw_sha256',
      v_projection_receipt->>'projected_sha256',
      v_projection_receipt->>'projection_method',
      v_projection_receipt->>'projection_version',
      null,
      v_projection_receipt->>'offset_mapping_status',
      v_projection_receipt->'charset_receipt',
      v_projection_receipt->'excluded_regions',
      v_projection_verified
    );

    INSERT INTO rosetta_v2513.rosetta_object_source_span(
      object_type, object_id, extraction_run_id,
      source_document_id, source_block_id,
      source_offset_start, source_offset_end,
      raw_text, normalized_text, raw_text_hash,
      projection_version, span_status
    ) VALUES (
      v_row.object_type,
      v_row.object_id,
      p_extraction_run_id,
      v_doc_id,
      v_row.source_block_id,
      v_absolute_start,
      v_absolute_end,
      v_raw_text,
      v_needle,
      CASE
        WHEN v_raw_text IS NULL THEN null
        ELSE encode(digest(convert_to(v_raw_text,'UTF8'),'sha256'),'hex')
      END,
      'v2.5.38_tier2_v2537_map',
      v_status
    )
    ON CONFLICT(object_type,object_id) DO UPDATE SET
      extraction_run_id = excluded.extraction_run_id,
      source_document_id = excluded.source_document_id,
      source_block_id = excluded.source_block_id,
      source_offset_start = excluded.source_offset_start,
      source_offset_end = excluded.source_offset_end,
      raw_text = excluded.raw_text,
      normalized_text = excluded.normalized_text,
      raw_text_hash = excluded.raw_text_hash,
      projection_version = excluded.projection_version,
      span_status = excluded.span_status,
      created_at = now();

    IF v_status='resolved' THEN
      v_tier2_resolved := v_tier2_resolved + 1;
    ELSIF v_status='ambiguous' THEN
      v_ambiguous := v_ambiguous + 1;
    ELSE
      v_unresolved := v_unresolved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'contract','rosetta-object-source-span-v2538',
    'extraction_run_id',p_extraction_run_id,
    'source_document_id',v_doc_id,
    'source_content_id',v_content_id,
    'total_objects',v_total,
    'tier1_direct_resolved',v_tier1_direct,
    'tier1_runbound_reconstructed',v_tier1_reconstructed,
    'tier2_fallback_resolved',v_tier2_resolved,
    'ambiguous',v_ambiguous,
    'unresolved',v_unresolved,
    'authorities',jsonb_build_array(
      'execution_lineage',
      'coordinate_containment',
      'run_local_multiplicity'
    )
  );
END;
$function$

COMMIT;
