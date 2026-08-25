-- Retrieved 2026-08-23 via pg_get_viewdef (read-only), project kjzytnzkkdpdxtqtjlew; md5(pg_get_viewdef)=49efc0ab12bf34807ffd99c019571203 verified
 SELECT extraction_run_id,
    source_document_id,
    corpus_id,
    document_name,
    document_type,
    document_identifier,
    run_version,
    run_status,
    confidence_threshold,
    created_at,
    completed_at,
    rosetta_v25_enrich_objects_with_spans(extraction_run_id, objects) AS objects,
    coverage,
    provenance_state,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    source_identity_hash,
    source_content_hash,
    output_content_hash,
    admissibility_state,
    source_url,
    source_version,
    media_type,
    source_byte_hash,
    source_provider_hash,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('key', representation.id, 'representation_type', representation.representation_type, 'source_object_type', 'rosetta_structural_representation', 'source_object_id', representation.id, 'source_block_id', representation.source_block_id, 'extraction_run_id', (representation.extraction_run_id)::text, 'normalized_value', representation.representation_json, 'confidence', representation.confidence, 'confirmed', (representation.signal_status = 'confirmed'::text), 'metadata', jsonb_build_object('signal_status', representation.signal_status, 'source_span', jsonb_build_object('span_status',
                CASE
                    WHEN (block.id IS NULL) THEN 'unresolved'::text
                    ELSE 'resolved'::text
                END, 'char_offset_start', block.char_offset_start, 'char_offset_end', block.char_offset_end, 'block_content_hash', block.block_content_hash, 'section_number', block.section_number, 'projection_version', 'rosetta-layout-projection-v25'))) ORDER BY representation.id) AS jsonb_agg
           FROM (rosetta_structural_representation representation
             LEFT JOIN hr1_raw_blocks block ON ((block.id = representation.source_block_id)))
          WHERE (representation.extraction_run_id = law.extraction_run_id)), '[]'::jsonb) AS structural_representations
   FROM v_civic_genome_law_view_v1_internal law;