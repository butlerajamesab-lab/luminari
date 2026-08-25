-- Retrieved 2026-08-23 via pg_get_viewdef (read-only), project kjzytnzkkdpdxtqtjlew; md5(pg_get_viewdef)=4ea508fc4dde55ab98d4d6bd403763bc verified
 WITH run_base AS (
         SELECT er.id AS extraction_run_id,
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
           FROM ((extraction_run er
             JOIN source_document sd ON ((sd.id = er.source_document_id)))
             LEFT JOIN source_document_content sdc ON ((sdc.source_content_id = er.source_content_id)))
        ), coverage_by_layer AS (
         SELECT lc.extraction_run_id,
            lc.layer_name,
                CASE
                    WHEN bool_or((lc.coverage_status = 'extraction_failed'::text)) THEN 'extraction_failed'::text
                    WHEN bool_or((lc.coverage_status = 'pending_extraction'::text)) THEN 'pending_extraction'::text
                    WHEN bool_or((lc.coverage_status = 'populated'::text)) THEN 'populated'::text
                    ELSE 'not_applicable'::text
                END AS coverage_status,
            string_agg(DISTINCT lc.reason, ' | '::text ORDER BY lc.reason) FILTER (WHERE (lc.reason IS NOT NULL)) AS reason,
            max(lc.validated_at) AS validated_at
           FROM layer_coverage lc
          GROUP BY lc.extraction_run_id, lc.layer_name
        ), coverage AS (
         SELECT cbl.extraction_run_id,
            jsonb_object_agg(lower(cbl.layer_name), jsonb_build_object('status', cbl.coverage_status, 'reason', cbl.reason, 'validated_at', cbl.validated_at) ORDER BY cbl.layer_name) AS coverage_json,
            count(*) AS layer_count,
            bool_and((cbl.coverage_status = ANY (ARRAY['populated'::text, 'not_applicable'::text]))) AS coverage_terminal
           FROM coverage_by_layer cbl
          GROUP BY cbl.extraction_run_id
        ), objects AS (
         SELECT unified.extraction_run_id,
            jsonb_agg(unified.object_json ORDER BY unified.layer_name, unified.object_id) AS objects_json
           FROM ( SELECT h.extraction_run_id,
                    'help'::text AS layer_name,
                    h.id AS object_id,
                    jsonb_build_object('layer', 'help', 'key', h.id, 'source_object_type', 'help_entity', 'source_object_id', h.id, 'source_block_id', h.source_block_id, 'extraction_run_id', (h.extraction_run_id)::text, 'normalized_value', jsonb_build_object('entity_name', h.entity_name, 'entity_type', h.entity_type, 'governing_section', h.governing_section, 'status', h.status, 'effective_date', h.effective_date, 'sunset_date', h.sunset_date), 'confidence', COALESCE(h.confidence, (0)::numeric), 'confirmed', (COALESCE(h.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', h.canon_version, 'signal_status', h.signal_status, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS object_json
                   FROM (help_entity h
                     LEFT JOIN hr1_raw_blocks rb_1 ON ((rb_1.id = h.source_block_id)))
                UNION ALL
                 SELECT wp.extraction_run_id,
                    'workflow'::text AS text,
                    wp.id,
                    jsonb_build_object('layer', 'workflow', 'key', wp.id, 'source_object_type', 'workflow_pipeline', 'source_object_id', wp.id, 'source_block_id', wp.source_block_id, 'extraction_run_id', (wp.extraction_run_id)::text, 'normalized_value', jsonb_build_object('pipeline_name', wp.pipeline_name, 'governing_section', wp.governing_section, 'pipeline_type', wp.pipeline_type, 'steps', COALESCE(( SELECT jsonb_agg(jsonb_build_object('step_id', ws.id, 'step_order', ws.step_order, 'step_name', ws.step_name, 'actor', ws.actor, 'verb', ws.verb, 'governing_section', ws.governing_section) ORDER BY ws.step_order) AS jsonb_agg
                           FROM workflow_step ws
                          WHERE (ws.workflow_pipeline_id = wp.id)), '[]'::jsonb)), 'confidence', COALESCE(wp.confidence, (0)::numeric), 'confirmed', (COALESCE(wp.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', wp.canon_version, 'signal_status', wp.signal_status, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (workflow_pipeline wp
                     LEFT JOIN hr1_raw_blocks rb_1 ON ((rb_1.id = wp.source_block_id)))
                UNION ALL
                 SELECT ar.extraction_run_id,
                    'accountability'::text AS text,
                    ar.id,
                    jsonb_build_object('layer', 'accountability', 'key', ar.id, 'source_object_type', 'accountability_route', 'source_object_id', ar.id, 'source_block_id', ar.source_block_id, 'extraction_run_id', (ar.extraction_run_id)::text, 'normalized_value', jsonb_build_object('route_name', ar.route_name, 'governing_section', ar.governing_section, 'trigger_condition', ar.trigger_condition, 'enforcement_type', ar.enforcement_type, 'enforcement_actor', ar.enforcement_actor, 'enforcement_direction', ar.enforcement_direction, 'escalation_nodes', COALESCE(( SELECT jsonb_agg(jsonb_build_object('node_id', en.id, 'node_order', en.node_order, 'node_name', en.node_name, 'action_required', en.action_required, 'escalation_trigger', en.escalation_trigger) ORDER BY en.node_order) AS jsonb_agg
                           FROM escalation_node en
                          WHERE (en.accountability_route_id = ar.id)), '[]'::jsonb), 'appeal_pathways', COALESCE(( SELECT jsonb_agg(jsonb_build_object('appeal_id', ap.id, 'appeal_type', ap.appeal_type, 'appeal_venue', ap.appeal_venue, 'appeal_deadline', ap.appeal_deadline, 'governing_section', ap.governing_section) ORDER BY ap.id) AS jsonb_agg
                           FROM (escalation_node en
                             JOIN appeal_pathway ap ON ((ap.escalation_node_id = en.id)))
                          WHERE (en.accountability_route_id = ar.id)), '[]'::jsonb)), 'confidence', COALESCE(ar.confidence, (0)::numeric), 'confirmed', (COALESCE(ar.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', ar.canon_version, 'signal_status', ar.signal_status, 'actor_canon_id', ar.actor_canon_id, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (accountability_route ar
                     LEFT JOIN hr1_raw_blocks rb_1 ON ((rb_1.id = ar.source_block_id)))
                UNION ALL
                 SELECT eo.extraction_run_id,
                    'override'::text AS text,
                    eo.id,
                    jsonb_build_object('layer', 'override', 'key', eo.id, 'source_object_type', 'entity_override', 'source_object_id', eo.id, 'source_block_id', eo.source_block_id, 'extraction_run_id', (eo.extraction_run_id)::text, 'normalized_value', jsonb_build_object('override_type', eo.override_type, 'overridden_authority', eo.overridden_authority, 'override_scope', eo.override_scope, 'override_condition', eo.override_condition, 'granting_actor', eo.granting_actor, 'effective_date', eo.effective_date, 'sunset_date', eo.sunset_date, 'temporal_status', eo.temporal_status, 'governing_section', rb_1.section_number), 'confidence', COALESCE(eo.confidence, (0)::numeric), 'confirmed', (COALESCE(eo.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', eo.canon_version, 'signal_status', eo.signal_status, 'actor_canon_id', eo.actor_canon_id, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (entity_override eo
                     LEFT JOIN hr1_raw_blocks rb_1 ON ((rb_1.id = eo.source_block_id)))
                UNION ALL
                 SELECT td.extraction_run_id,
                    'definition'::text AS text,
                    td.id,
                    jsonb_build_object('layer', 'definition', 'key', td.id, 'source_object_type', 'term_definition', 'source_object_id', td.id, 'source_block_id', td.source_block_id, 'extraction_run_id', (td.extraction_run_id)::text, 'normalized_value', jsonb_build_object('defined_term', td.defined_term, 'defining_section', td.defining_section, 'definition_text', td.definition_text, 'definition_type', td.definition_type), 'confidence', COALESCE(td.confidence, (0)::numeric), 'confirmed', (COALESCE(td.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', td.canon_version, 'signal_status', td.signal_status, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (term_definition td
                     LEFT JOIN hr1_raw_blocks rb_1 ON ((rb_1.id = td.source_block_id)))) unified
          GROUP BY unified.extraction_run_id
        )
 SELECT rb.extraction_run_id,
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
    COALESCE(o.objects_json, '[]'::jsonb) AS objects,
    COALESCE(c.coverage_json, '{}'::jsonb) AS coverage,
        CASE
            WHEN ((rb.run_status = ANY (ARRAY['completed'::text, 'validated'::text])) AND (rb.admissibility_state = 'admissible'::text) AND (rb.engine_version IS NOT NULL) AND (rb.rule_set_version IS NOT NULL) AND (rb.rule_manifest_hash IS NOT NULL) AND (rb.source_content_hash IS NOT NULL) AND (rb.output_content_hash IS NOT NULL) AND (COALESCE(c.layer_count, (0)::bigint) = 5) AND COALESCE(c.coverage_terminal, false)) THEN 'complete'::text
            WHEN ((rb.run_status = 'failed'::text) OR (rb.admissibility_state = 'rejected'::text)) THEN 'failed'::text
            ELSE 'partial'::text
        END AS provenance_state,
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
   FROM ((run_base rb
     LEFT JOIN coverage c ON ((c.extraction_run_id = rb.extraction_run_id)))
     LEFT JOIN objects o ON ((o.extraction_run_id = rb.extraction_run_id)));