-- ============================================================================
-- Migration 02 -- candidate schema rosetta_v2513: structural mirrors of every
-- table the 2.5.11 closure touches (plus FK-closure targets), the two mirrored
-- reporting views, lane-invariant span storage adapters, candidate-only
-- receipt tables, and lockdown. No production object is touched.
-- Column types, nullability, defaults, and constraints are transcribed from
-- hash-verified evidence/schema/*.json. Sequences are schema-local.
-- Candidate objects are structurally unable to publish: the publication view
-- public.v_civic_genome_law_view_v1 reads only public.* tables via
-- public.rosetta_is_current_publishable_run_v1 and the registry; nothing here
-- is referenced by that path, and this schema holds no publication privilege.
-- ============================================================================

create schema if not exists rosetta_v2513;
comment on schema rosetta_v2513 is
  'Rosetta 2.5.13 controlled-recovery candidate namespace. Closed: candidate objects reference only rosetta_v2513, pg_catalog, extensions. Structurally excluded from publication.';

create sequence if not exists rosetta_v2513.extraction_run_id_seq;

create sequence if not exists rosetta_v2513.source_document_id_seq;

create sequence if not exists rosetta_v2513.corpus_id_seq;

-- local roles for the candidate environment (no-op where they exist)
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

create table if not exists rosetta_v2513.accountability_route (
    id text not null,
    corpus_id integer not null,
    source_document_id integer not null,
    extraction_run_id integer not null,
    canon_version integer not null default 1,
    source_block_id text,
    route_name text not null,
    governing_section text not null,
    trigger_condition text not null,
    enforcement_type text not null,
    enforcement_actor text,
    actor_canon_id text,
    enforcement_direction text not null default 'individual_penalty'::text,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    clause_type text,
    action_type text,
    actor_canonical text,
    actor_label text,
    actor_source_text text,
    actor_canonical_type text,
    section_declared text,
    section_observed text,
    section_status text,
    constraint accountability_route_action_type_check check (((action_type IS NULL) OR (action_type = ANY (ARRAY['must'::text, 'may'::text, 'shall'::text, 'is_entitled'::text, 'is_subject_to'::text])))),
    constraint accountability_route_clause_type_check check (((clause_type IS NULL) OR (clause_type = ANY (ARRAY['definition'::text, 'court_order'::text, 'petition_authorization'::text, 'prosecutorial_authority'::text, 'agency_mandate'::text, 'procedure'::text, 'standard_of_proof'::text])))),
    constraint accountability_route_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint accountability_route_enforcement_direction_check check ((enforcement_direction = ANY (ARRAY['individual_penalty'::text, 'agency_mandate'::text, 'structural_override'::text, 'reporting_requirement'::text, 'definition'::text, 'court_order'::text, 'petition_authorization'::text, 'prosecutorial_authority'::text, 'procedure'::text, 'standard_of_proof'::text]))),
    constraint accountability_route_pkey PRIMARY KEY (id),
    constraint accountability_route_section_status_check check (((section_status IS NULL) OR (section_status = ANY (ARRAY['resolved'::text, 'multi_section'::text, 'unresolved'::text])))),
    constraint accountability_route_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text])))
);

create table if not exists rosetta_v2513.actor_alias (
    id text default gen_random_uuid()::text,
    actor_canon_id text not null,
    raw_actor_string text not null,
    extraction_run_id integer,
    confidence numeric,
    created_at timestamp with time zone default now(),
    constraint actor_alias_actor_canon_id_raw_actor_string_extraction_run__key UNIQUE (actor_canon_id, raw_actor_string, extraction_run_id),
    constraint actor_alias_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.actor_canon (
    id text not null,
    canonical_name text not null,
    jurisdiction_level text,
    agency_link text,
    entity_type text not null,
    canonical_metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    constraint actor_canon_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.appeal_pathway (
    id text not null,
    escalation_node_id text not null,
    appeal_type text not null,
    appeal_venue text,
    appeal_deadline text,
    governing_section text,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    constraint appeal_pathway_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint appeal_pathway_pkey PRIMARY KEY (id),
    constraint appeal_pathway_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text])))
);

create table if not exists rosetta_v2513.corpus (
    id integer not null default nextval('rosetta_v2513.corpus_id_seq'::regclass),
    corpus_name text not null,
    corpus_type text default 'legislative'::text,
    created_at timestamp with time zone default now(),
    constraint corpus_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.entity_override (
    id text not null,
    corpus_id integer not null,
    source_document_id integer not null,
    extraction_run_id integer not null,
    canon_version integer not null default 1,
    source_block_id text,
    override_type text not null,
    overridden_authority text not null,
    override_scope text not null,
    override_condition text not null,
    granting_actor text,
    actor_canon_id text,
    effective_date date,
    sunset_date date,
    temporal_status text default 'pending'::text,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    constraint entity_override_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint entity_override_pkey PRIMARY KEY (id),
    constraint entity_override_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text]))),
    constraint entity_override_temporal_status_check check ((temporal_status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'superseded'::text, 'adopted'::text, 'not_adopted'::text, 'unknown'::text])))
);

create table if not exists rosetta_v2513.escalation_node (
    id text not null,
    accountability_route_id text not null,
    node_order integer not null,
    node_name text not null,
    action_required text not null,
    actor_canon_id text,
    escalation_trigger text,
    created_at timestamp with time zone default now(),
    constraint escalation_node_accountability_route_id_node_order_key UNIQUE (accountability_route_id, node_order),
    constraint escalation_node_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.extraction_manifest (
    id text not null default (gen_random_uuid())::text,
    extraction_run_id integer not null,
    source_document_id integer not null,
    corpus_id integer not null,
    canon_version integer not null default 1,
    executed_at timestamp with time zone default now(),
    source_hash text not null,
    row_counts jsonb not null,
    validation_results jsonb not null,
    drift_events jsonb default '[]'::jsonb,
    status text not null,
    source_content_id uuid,
    source_identity_hash text,
    engine_version text,
    rule_set_version text,
    rule_manifest_hash text,
    configuration_hash text,
    output_hash text,
    admissibility_state text,
    constraint extraction_manifest_pkey PRIMARY KEY (id),
    constraint extraction_manifest_status_check check ((status = ANY (ARRAY['clean'::text, 'drift_detected'::text, 'failed'::text])))
);

create table if not exists rosetta_v2513.extraction_rule_manifest (
    manifest_id uuid not null default gen_random_uuid(),
    engine_version text not null,
    rule_set_version text not null,
    manifest_hash text not null,
    manifest_json jsonb not null,
    is_active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    constraint extraction_rule_manifest_hash_format check ((manifest_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint extraction_rule_manifest_hash_unique UNIQUE (manifest_hash),
    constraint extraction_rule_manifest_pkey PRIMARY KEY (manifest_id),
    constraint extraction_rule_manifest_version_unique UNIQUE (engine_version, rule_set_version)
);

create table if not exists rosetta_v2513.extraction_run (
    id integer not null default nextval('rosetta_v2513.extraction_run_id_seq'::regclass),
    source_document_id integer not null,
    run_version integer not null default 1,
    run_status text default 'in_progress'::text,
    confidence_threshold numeric not null default 0.85,
    created_at timestamp with time zone default now(),
    completed_at timestamp with time zone,
    source_content_id uuid,
    engine_version text,
    rule_set_version text,
    rule_manifest_hash text,
    configuration_hash text,
    configuration_json jsonb,
    source_identity_hash text,
    source_content_hash text,
    output_content_hash text,
    admissibility_state text not null default 'pending'::text,
    failure_code text,
    constraint extraction_run_admissibility_state_check check ((admissibility_state = ANY (ARRAY['pending'::text, 'admissible'::text, 'rejected'::text]))),
    constraint extraction_run_pkey PRIMARY KEY (id),
    constraint extraction_run_run_status_check check ((run_status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'failed'::text, 'validated'::text])))
);

create table if not exists rosetta_v2513.extraction_run_config (
    id text not null default (gen_random_uuid())::text,
    extraction_run_id integer not null,
    confidence_threshold numeric not null default 0.85,
    auto_confirm_above_threshold boolean default false,
    require_human_review_below numeric default 0.70,
    created_at timestamp with time zone default now(),
    engine_version text,
    rule_set_version text,
    rule_manifest_hash text,
    configuration_hash text,
    configuration_json jsonb,
    constraint extraction_run_config_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.help_entity (
    id text not null,
    corpus_id integer not null,
    source_document_id integer not null,
    extraction_run_id integer not null,
    canon_version integer not null default 1,
    source_block_id text,
    entity_name text not null,
    entity_type text not null,
    governing_section text not null,
    status text not null,
    effective_date text,
    sunset_date text,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    constraint help_entity_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint help_entity_pkey PRIMARY KEY (id),
    constraint help_entity_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text]))),
    constraint help_entity_status_check check ((status = ANY (ARRAY['created'::text, 'modified'::text, 'repealed'::text, 'extended'::text])))
);

create table if not exists rosetta_v2513.hr1_raw_blocks (
    id text not null,
    extraction_run_id integer not null,
    source_document_id integer not null,
    block_type text not null,
    section_number text not null,
    section_heading_hash text not null,
    block_content_hash text not null,
    parent_block_id text,
    hierarchy_path text not null,
    char_offset_start integer not null,
    char_offset_end integer not null,
    created_at timestamp with time zone default now(),
    constraint chk_offset check ((char_offset_end > char_offset_start)),
    constraint hr1_raw_blocks_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.layer_coverage (
    id text not null default (gen_random_uuid())::text,
    extraction_run_id integer not null,
    source_block_id text not null,
    layer_name text not null,
    coverage_status text not null default 'pending_extraction'::text,
    reason text,
    validated_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    constraint layer_coverage_coverage_status_check check ((coverage_status = ANY (ARRAY['populated'::text, 'not_applicable'::text, 'pending_extraction'::text, 'extraction_failed'::text]))),
    constraint layer_coverage_extraction_run_id_source_block_id_layer_name_key UNIQUE (extraction_run_id, source_block_id, layer_name),
    constraint layer_coverage_layer_name_check check ((layer_name = ANY (ARRAY['HELP'::text, 'WORKFLOW'::text, 'ACCOUNTABILITY'::text, 'OVERRIDES'::text, 'DEFINITIONS'::text]))),
    constraint layer_coverage_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.rosetta_canonical_clause (
    canonical_clause_id uuid not null default gen_random_uuid(),
    normalized_text_hash text not null,
    normalized_text text not null,
    clause_type text not null,
    created_at timestamp with time zone not null default now(),
    constraint rosetta_canonical_clause_normalized_text_hash_check check ((normalized_text_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint rosetta_canonical_clause_normalized_text_hash_clause_type_key UNIQUE (normalized_text_hash, clause_type),
    constraint rosetta_canonical_clause_pkey PRIMARY KEY (canonical_clause_id)
);

create table if not exists rosetta_v2513.rosetta_clause_ir (
    id uuid default gen_random_uuid(),
    extraction_run_id integer,
    source_document_id integer,
    source_block_id text,
    parser_version text,
    clause_index integer,
    source_text text,
    char_offset_start integer,
    char_offset_end integer,
    source_content_hash text,
    clause_kind text,
    actor_text text,
    actor_canon_id text,
    actor_role text,
    modal text,
    action_text text,
    object_text text,
    condition_text text,
    deadline_text text,
    exception_text text,
    enumeration_status text default 'none'::text,
    parse_status text,
    diagnostics jsonb default '[]'::jsonb,
    normalized_value jsonb,
    created_at timestamp with time zone default now(),
    constraint rosetta_clause_ir_char_offset_start_check check ((char_offset_start >= 0)),
    constraint rosetta_clause_ir_check check ((char_offset_end > char_offset_start)),
    constraint rosetta_clause_ir_clause_index_check check ((clause_index > 0)),
    constraint rosetta_clause_ir_clause_kind_check check ((clause_kind = ANY (ARRAY['duty'::text, 'permission'::text, 'private_right'::text, 'private_remedy'::text, 'prohibition'::text, 'status_creation'::text, 'temporal_rule'::text, 'fee_rule'::text, 'eligibility_rule'::text, 'immunity_rule'::text, 'forfeiture_rule'::text, 'definition'::text, 'exception'::text, 'amendment_scaffold'::text, 'short_title'::text, 'unknown'::text]))),
    constraint rosetta_clause_ir_diagnostics_check check ((jsonb_typeof(diagnostics) = 'array'::text)),
    constraint rosetta_clause_ir_enumeration_status_check check ((enumeration_status = ANY (ARRAY['none'::text, 'complete'::text, 'lead_in'::text, 'incomplete'::text, 'orphan_child'::text]))),
    constraint rosetta_clause_ir_extraction_run_id_parser_version_source_b_key UNIQUE (extraction_run_id, parser_version, source_block_id, clause_index),
    constraint rosetta_clause_ir_modal_check check (((modal IS NULL) OR (modal = ANY (ARRAY['shall'::text, 'must'::text, 'may'::text, 'may_not'::text, 'must_not'::text])))),
    constraint rosetta_clause_ir_normalized_value_check check (((normalized_value IS NULL) OR (jsonb_typeof(normalized_value) = 'object'::text))),
    constraint rosetta_clause_ir_parse_status_check check ((parse_status = ANY (ARRAY['clean'::text, 'ambiguous_modal'::text, 'incomplete_enumeration'::text, 'malformed_source'::text, 'unresolved'::text, 'needs_review'::text]))),
    constraint rosetta_clause_ir_pkey PRIMARY KEY (id),
    constraint rosetta_clause_ir_source_content_hash_check check ((source_content_hash ~ '^[a-f0-9]{64}$'::text))
);

create table if not exists rosetta_v2513.rosetta_clause_occurrence (
    occurrence_id uuid not null default gen_random_uuid(),
    canonical_clause_id uuid not null,
    accountability_route_id text not null,
    extraction_run_id integer not null,
    source_document_id integer not null,
    source_block_id text,
    source_offset_start integer,
    source_offset_end integer,
    section_observed text,
    section_status text not null,
    source_text text not null,
    created_at timestamp with time zone not null default now(),
    escalation_node_id text not null,
    constraint rosetta_clause_occurrence_pkey PRIMARY KEY (occurrence_id),
    constraint rosetta_clause_occurrence_route_node_key UNIQUE (accountability_route_id, escalation_node_id)
);

create table if not exists rosetta_v2513.rosetta_current_generation_registry_v1 (
    singleton boolean not null default true,
    contract text not null default 'rosetta-current-generation-v1'::text,
    engine_version text not null,
    rule_set_version text not null,
    rule_manifest_hash text not null,
    validation_test_name text not null,
    promoted_at timestamp with time zone not null default now(),
    constraint rosetta_current_generation_registry_v1_pkey PRIMARY KEY (singleton),
    constraint rosetta_current_generation_registry_v1_rule_manifest_hash_check check ((rule_manifest_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint rosetta_current_generation_registry_v1_singleton_check check (singleton)
);

create table if not exists rosetta_v2513.rosetta_object_correction (
    correction_id uuid not null default gen_random_uuid(),
    extraction_run_id integer not null,
    source_document_id integer not null,
    object_type text not null,
    object_id text not null,
    field_name text not null,
    prior_value jsonb,
    corrected_value jsonb,
    correction_rule_version text not null,
    corrected_at timestamp with time zone not null default now(),
    constraint rosetta_object_correction_object_type_object_id_field_name__key UNIQUE (object_type, object_id, field_name, correction_rule_version),
    constraint rosetta_object_correction_pkey PRIMARY KEY (correction_id)
);

create table if not exists rosetta_v2513.rosetta_object_source_span (
    object_type text not null,
    object_id text not null,
    extraction_run_id integer not null,
    source_document_id integer not null,
    source_block_id text,
    source_offset_start integer,
    source_offset_end integer,
    raw_text text,
    normalized_text text not null,
    raw_text_hash text,
    projection_version text not null,
    span_status text not null,
    created_at timestamp with time zone not null default now(),
    constraint rosetta_object_source_span_pkey PRIMARY KEY (object_type, object_id),
    constraint rosetta_object_source_span_span_status_check check ((span_status = ANY (ARRAY['resolved'::text, 'ambiguous'::text, 'unresolved'::text])))
);

create table if not exists rosetta_v2513.rosetta_structural_repair_queue (
    repair_id uuid not null default gen_random_uuid(),
    extraction_run_id integer not null,
    source_document_id integer not null,
    object_type text not null,
    object_id text not null,
    defect_type text not null,
    defect_detail jsonb not null default '{}'::jsonb,
    repair_state text not null default 'open'::text,
    created_at timestamp with time zone not null default now(),
    resolved_at timestamp with time zone,
    constraint rosetta_structural_repair_que_object_type_object_id_defect__key UNIQUE (object_type, object_id, defect_type),
    constraint rosetta_structural_repair_queue_pkey PRIMARY KEY (repair_id),
    constraint rosetta_structural_repair_queue_repair_state_check check ((repair_state = ANY (ARRAY['open'::text, 'in_review'::text, 'resolved'::text, 'superseded'::text])))
);

create table if not exists rosetta_v2513.rosetta_structural_representation (
    id text not null,
    corpus_id integer not null,
    source_document_id integer not null,
    extraction_run_id integer not null,
    source_block_id text not null,
    representation_type text not null,
    representation_json jsonb not null,
    confidence numeric not null default 1.00,
    signal_status text not null default 'confirmed'::text,
    created_at timestamp with time zone not null default now(),
    constraint rosetta_structural_representa_extraction_run_id_representat_key UNIQUE (extraction_run_id, representation_type, source_block_id),
    constraint rosetta_structural_representation_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint rosetta_structural_representation_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.source_document (
    id integer not null default nextval('rosetta_v2513.source_document_id_seq'::regclass),
    corpus_id integer not null,
    document_name text not null,
    document_type text,
    document_identifier text,
    created_at timestamp with time zone default now(),
    constraint source_document_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.source_document_content (
    source_content_id uuid not null default gen_random_uuid(),
    source_document_id integer not null,
    source_version text not null,
    source_url text not null,
    media_type text not null,
    source_text text not null,
    source_content_hash text not null,
    source_byte_hash text,
    source_provider_hash text,
    source_identity_hash text not null,
    source_metadata jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone not null default now(),
    constraint source_document_byte_hash_format check (((source_byte_hash IS NULL) OR (source_byte_hash ~ '^[0-9a-f]{64}$'::text))),
    constraint source_document_content_hash_format check ((source_content_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint source_document_content_identity_unique UNIQUE (source_identity_hash),
    constraint source_document_content_nonempty check ((char_length(source_text) > 0)),
    constraint source_document_content_pkey PRIMARY KEY (source_content_id),
    constraint source_document_content_version_unique UNIQUE (source_document_id, source_version),
    constraint source_document_identity_hash_format check ((source_identity_hash ~ '^[0-9a-f]{64}$'::text))
);

create table if not exists rosetta_v2513.term_definition (
    id text not null,
    corpus_id integer not null,
    source_document_id integer not null,
    extraction_run_id integer not null,
    canon_version integer not null default 1,
    source_block_id text,
    defined_term text not null,
    defining_section text not null,
    definition_text text not null,
    definition_type text not null,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    section_declared text,
    section_observed text,
    section_status text,
    constraint term_definition_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint term_definition_confirmed_section_resolved check (((COALESCE(signal_status, ''::text) <> 'confirmed'::text) OR ((section_status = 'resolved'::text) AND (NOT (section_declared IS DISTINCT FROM section_observed))))),
    constraint term_definition_definition_type_check check ((definition_type = ANY (ARRAY['expansive'::text, 'restrictive'::text, 'technical'::text, 'clarifying'::text]))),
    constraint term_definition_pkey PRIMARY KEY (id),
    constraint term_definition_section_status_check check (((section_status IS NULL) OR (section_status = ANY (ARRAY['resolved'::text, 'multi_section'::text, 'unresolved'::text])))),
    constraint term_definition_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text])))
);

create table if not exists rosetta_v2513.term_definition_affected_steps (
    id text not null default (gen_random_uuid())::text,
    term_definition_id text not null,
    workflow_step_id text not null,
    effect_type text default 'modifies_boundary'::text,
    created_at timestamp with time zone default now(),
    constraint term_definition_affected_step_term_definition_id_workflow_s_key UNIQUE (term_definition_id, workflow_step_id),
    constraint term_definition_affected_steps_effect_type_check check ((effect_type = ANY (ARRAY['modifies_boundary'::text, 'creates_exemption'::text, 'restricts_scope'::text, 'expands_scope'::text]))),
    constraint term_definition_affected_steps_pkey PRIMARY KEY (id)
);

create table if not exists rosetta_v2513.validation_result (
    id text not null default (gen_random_uuid())::text,
    extraction_run_id integer not null,
    test_name text not null,
    test_result text not null,
    failure_count integer default 0,
    details jsonb,
    executed_at timestamp with time zone default now(),
    constraint validation_result_pkey PRIMARY KEY (id),
    constraint validation_result_test_result_check check ((test_result = ANY (ARRAY['pass'::text, 'fail'::text])))
);

create table if not exists rosetta_v2513.workflow_pipeline (
    id text not null,
    corpus_id integer not null,
    source_document_id integer not null,
    extraction_run_id integer not null,
    canon_version integer not null default 1,
    source_block_id text,
    pipeline_name text not null,
    governing_section text not null,
    pipeline_type text not null,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    constraint workflow_pipeline_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint workflow_pipeline_pkey PRIMARY KEY (id),
    constraint workflow_pipeline_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text])))
);

create table if not exists rosetta_v2513.workflow_step (
    id text not null,
    workflow_pipeline_id text not null,
    step_order integer not null,
    step_name text not null,
    actor text,
    actor_canon_id text,
    verb text,
    governing_section text,
    confidence numeric default 1.00,
    signal_status text default 'tentative'::text,
    created_at timestamp with time zone default now(),
    constraint workflow_step_confidence_check check (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    constraint workflow_step_pkey PRIMARY KEY (id),
    constraint workflow_step_signal_status_check check ((signal_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'human_review_required'::text]))),
    constraint workflow_step_workflow_pipeline_id_step_order_key UNIQUE (workflow_pipeline_id, step_order)
);

alter table rosetta_v2513.accountability_route add constraint accountability_route_actor_canon_id_fkey FOREIGN KEY (actor_canon_id) REFERENCES rosetta_v2513.actor_canon(id);
alter table rosetta_v2513.accountability_route add constraint accountability_route_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.accountability_route add constraint accountability_route_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.accountability_route add constraint accountability_route_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.accountability_route add constraint accountability_route_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.actor_alias add constraint actor_alias_actor_canon_id_fkey FOREIGN KEY (actor_canon_id) REFERENCES rosetta_v2513.actor_canon(id);
alter table rosetta_v2513.actor_alias add constraint actor_alias_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.appeal_pathway add constraint appeal_pathway_escalation_node_id_fkey FOREIGN KEY (escalation_node_id) REFERENCES rosetta_v2513.escalation_node(id) ON DELETE CASCADE;
alter table rosetta_v2513.entity_override add constraint entity_override_actor_canon_id_fkey FOREIGN KEY (actor_canon_id) REFERENCES rosetta_v2513.actor_canon(id);
alter table rosetta_v2513.entity_override add constraint entity_override_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.entity_override add constraint entity_override_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.entity_override add constraint entity_override_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.entity_override add constraint entity_override_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.escalation_node add constraint escalation_node_accountability_route_id_fkey FOREIGN KEY (accountability_route_id) REFERENCES rosetta_v2513.accountability_route(id) ON DELETE CASCADE;
alter table rosetta_v2513.escalation_node add constraint escalation_node_actor_canon_id_fkey FOREIGN KEY (actor_canon_id) REFERENCES rosetta_v2513.actor_canon(id);
alter table rosetta_v2513.extraction_manifest add constraint extraction_manifest_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.extraction_manifest add constraint extraction_manifest_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.extraction_manifest add constraint extraction_manifest_source_content_id_fkey FOREIGN KEY (source_content_id) REFERENCES rosetta_v2513.source_document_content(source_content_id);
alter table rosetta_v2513.extraction_manifest add constraint extraction_manifest_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.extraction_run add constraint extraction_run_source_content_id_fkey FOREIGN KEY (source_content_id) REFERENCES rosetta_v2513.source_document_content(source_content_id);
alter table rosetta_v2513.extraction_run add constraint extraction_run_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.extraction_run_config add constraint extraction_run_config_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.help_entity add constraint help_entity_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.help_entity add constraint help_entity_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.help_entity add constraint help_entity_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.help_entity add constraint help_entity_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.hr1_raw_blocks add constraint hr1_raw_blocks_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.hr1_raw_blocks add constraint hr1_raw_blocks_parent_block_id_fkey FOREIGN KEY (parent_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.hr1_raw_blocks add constraint hr1_raw_blocks_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.layer_coverage add constraint layer_coverage_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.layer_coverage add constraint layer_coverage_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.rosetta_clause_ir add constraint rosetta_clause_ir_actor_canon_id_fkey FOREIGN KEY (actor_canon_id) REFERENCES rosetta_v2513.actor_canon(id);
alter table rosetta_v2513.rosetta_clause_ir add constraint rosetta_clause_ir_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.rosetta_clause_ir add constraint rosetta_clause_ir_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.rosetta_clause_ir add constraint rosetta_clause_ir_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_accountability_route_id_fkey FOREIGN KEY (accountability_route_id) REFERENCES rosetta_v2513.accountability_route(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_canonical_clause_id_fkey FOREIGN KEY (canonical_clause_id) REFERENCES rosetta_v2513.rosetta_canonical_clause(canonical_clause_id) ON DELETE RESTRICT;
alter table rosetta_v2513.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_escalation_node_id_fkey FOREIGN KEY (escalation_node_id) REFERENCES rosetta_v2513.escalation_node(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id) ON DELETE RESTRICT;
alter table rosetta_v2513.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_object_correction add constraint rosetta_object_correction_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_object_correction add constraint rosetta_object_correction_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_object_source_span add constraint rosetta_object_source_span_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_object_source_span add constraint rosetta_object_source_span_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_object_source_span add constraint rosetta_object_source_span_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_structural_repair_queue add constraint rosetta_structural_repair_queue_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_structural_repair_queue add constraint rosetta_structural_repair_queue_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_structural_representation add constraint rosetta_structural_representation_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_structural_representation add constraint rosetta_structural_representation_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_structural_representation add constraint rosetta_structural_representation_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id) ON DELETE CASCADE;
alter table rosetta_v2513.rosetta_structural_representation add constraint rosetta_structural_representation_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id) ON DELETE CASCADE;
alter table rosetta_v2513.source_document add constraint source_document_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.source_document_content add constraint source_document_content_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.term_definition add constraint term_definition_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.term_definition add constraint term_definition_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.term_definition add constraint term_definition_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.term_definition add constraint term_definition_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.term_definition_affected_steps add constraint term_definition_affected_steps_term_definition_id_fkey FOREIGN KEY (term_definition_id) REFERENCES rosetta_v2513.term_definition(id);
alter table rosetta_v2513.term_definition_affected_steps add constraint term_definition_affected_steps_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES rosetta_v2513.workflow_step(id);
alter table rosetta_v2513.validation_result add constraint validation_result_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.workflow_pipeline add constraint workflow_pipeline_corpus_id_fkey FOREIGN KEY (corpus_id) REFERENCES rosetta_v2513.corpus(id);
alter table rosetta_v2513.workflow_pipeline add constraint workflow_pipeline_extraction_run_id_fkey FOREIGN KEY (extraction_run_id) REFERENCES rosetta_v2513.extraction_run(id);
alter table rosetta_v2513.workflow_pipeline add constraint workflow_pipeline_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES rosetta_v2513.hr1_raw_blocks(id);
alter table rosetta_v2513.workflow_pipeline add constraint workflow_pipeline_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES rosetta_v2513.source_document(id);
alter table rosetta_v2513.workflow_step add constraint workflow_step_actor_canon_id_fkey FOREIGN KEY (actor_canon_id) REFERENCES rosetta_v2513.actor_canon(id);
alter table rosetta_v2513.workflow_step add constraint workflow_step_workflow_pipeline_id_fkey FOREIGN KEY (workflow_pipeline_id) REFERENCES rosetta_v2513.workflow_pipeline(id) ON DELETE CASCADE;
create unique index if not exists extraction_run_config_run_unique on rosetta_v2513.extraction_run_config (extraction_run_id);
create unique index if not exists validation_result_run_test_unique on rosetta_v2513.validation_result (extraction_run_id, test_name);
create unique index if not exists extraction_manifest_run_unique on rosetta_v2513.extraction_manifest (extraction_run_id);
create unique index if not exists extraction_run_replay_receipt_unique on rosetta_v2513.extraction_run (source_document_id, source_content_id, engine_version, rule_set_version, rule_manifest_hash, configuration_hash) where source_content_id is not null and engine_version is not null and rule_set_version is not null and rule_manifest_hash is not null and configuration_hash is not null;
create or replace view rosetta_v2513.v_civic_genome_law_view_v1_internal as
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
           FROM ((rosetta_v2513.extraction_run er
             JOIN rosetta_v2513.source_document sd ON ((sd.id = er.source_document_id)))
             LEFT JOIN rosetta_v2513.source_document_content sdc ON ((sdc.source_content_id = er.source_content_id)))
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
           FROM rosetta_v2513.layer_coverage lc
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
                   FROM (rosetta_v2513.help_entity h
                     LEFT JOIN rosetta_v2513.hr1_raw_blocks rb_1 ON ((rb_1.id = h.source_block_id)))
                UNION ALL
                 SELECT wp.extraction_run_id,
                    'workflow'::text AS text,
                    wp.id,
                    jsonb_build_object('layer', 'workflow', 'key', wp.id, 'source_object_type', 'workflow_pipeline', 'source_object_id', wp.id, 'source_block_id', wp.source_block_id, 'extraction_run_id', (wp.extraction_run_id)::text, 'normalized_value', jsonb_build_object('pipeline_name', wp.pipeline_name, 'governing_section', wp.governing_section, 'pipeline_type', wp.pipeline_type, 'steps', COALESCE(( SELECT jsonb_agg(jsonb_build_object('step_id', ws.id, 'step_order', ws.step_order, 'step_name', ws.step_name, 'actor', ws.actor, 'verb', ws.verb, 'governing_section', ws.governing_section) ORDER BY ws.step_order) AS jsonb_agg
                           FROM rosetta_v2513.workflow_step ws
                          WHERE (ws.workflow_pipeline_id = wp.id)), '[]'::jsonb)), 'confidence', COALESCE(wp.confidence, (0)::numeric), 'confirmed', (COALESCE(wp.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', wp.canon_version, 'signal_status', wp.signal_status, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (rosetta_v2513.workflow_pipeline wp
                     LEFT JOIN rosetta_v2513.hr1_raw_blocks rb_1 ON ((rb_1.id = wp.source_block_id)))
                UNION ALL
                 SELECT ar.extraction_run_id,
                    'accountability'::text AS text,
                    ar.id,
                    jsonb_build_object('layer', 'accountability', 'key', ar.id, 'source_object_type', 'accountability_route', 'source_object_id', ar.id, 'source_block_id', ar.source_block_id, 'extraction_run_id', (ar.extraction_run_id)::text, 'normalized_value', jsonb_build_object('route_name', ar.route_name, 'governing_section', ar.governing_section, 'trigger_condition', ar.trigger_condition, 'enforcement_type', ar.enforcement_type, 'enforcement_actor', ar.enforcement_actor, 'enforcement_direction', ar.enforcement_direction, 'escalation_nodes', COALESCE(( SELECT jsonb_agg(jsonb_build_object('node_id', en.id, 'node_order', en.node_order, 'node_name', en.node_name, 'action_required', en.action_required, 'escalation_trigger', en.escalation_trigger) ORDER BY en.node_order) AS jsonb_agg
                           FROM rosetta_v2513.escalation_node en
                          WHERE (en.accountability_route_id = ar.id)), '[]'::jsonb), 'appeal_pathways', COALESCE(( SELECT jsonb_agg(jsonb_build_object('appeal_id', ap.id, 'appeal_type', ap.appeal_type, 'appeal_venue', ap.appeal_venue, 'appeal_deadline', ap.appeal_deadline, 'governing_section', ap.governing_section) ORDER BY ap.id) AS jsonb_agg
                           FROM (rosetta_v2513.escalation_node en
                             JOIN rosetta_v2513.appeal_pathway ap ON ((ap.escalation_node_id = en.id)))
                          WHERE (en.accountability_route_id = ar.id)), '[]'::jsonb)), 'confidence', COALESCE(ar.confidence, (0)::numeric), 'confirmed', (COALESCE(ar.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', ar.canon_version, 'signal_status', ar.signal_status, 'actor_canon_id', ar.actor_canon_id, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (rosetta_v2513.accountability_route ar
                     LEFT JOIN rosetta_v2513.hr1_raw_blocks rb_1 ON ((rb_1.id = ar.source_block_id)))
                UNION ALL
                 SELECT eo.extraction_run_id,
                    'override'::text AS text,
                    eo.id,
                    jsonb_build_object('layer', 'override', 'key', eo.id, 'source_object_type', 'entity_override', 'source_object_id', eo.id, 'source_block_id', eo.source_block_id, 'extraction_run_id', (eo.extraction_run_id)::text, 'normalized_value', jsonb_build_object('override_type', eo.override_type, 'overridden_authority', eo.overridden_authority, 'override_scope', eo.override_scope, 'override_condition', eo.override_condition, 'granting_actor', eo.granting_actor, 'effective_date', eo.effective_date, 'sunset_date', eo.sunset_date, 'temporal_status', eo.temporal_status, 'governing_section', rb_1.section_number), 'confidence', COALESCE(eo.confidence, (0)::numeric), 'confirmed', (COALESCE(eo.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', eo.canon_version, 'signal_status', eo.signal_status, 'actor_canon_id', eo.actor_canon_id, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (rosetta_v2513.entity_override eo
                     LEFT JOIN rosetta_v2513.hr1_raw_blocks rb_1 ON ((rb_1.id = eo.source_block_id)))
                UNION ALL
                 SELECT td.extraction_run_id,
                    'definition'::text AS text,
                    td.id,
                    jsonb_build_object('layer', 'definition', 'key', td.id, 'source_object_type', 'term_definition', 'source_object_id', td.id, 'source_block_id', td.source_block_id, 'extraction_run_id', (td.extraction_run_id)::text, 'normalized_value', jsonb_build_object('defined_term', td.defined_term, 'defining_section', td.defining_section, 'definition_text', td.definition_text, 'definition_type', td.definition_type), 'confidence', COALESCE(td.confidence, (0)::numeric), 'confirmed', (COALESCE(td.signal_status, ''::text) = 'confirmed'::text), 'metadata', jsonb_build_object('canon_version', td.canon_version, 'signal_status', td.signal_status, 'source_span', jsonb_build_object('char_offset_start', rb_1.char_offset_start, 'char_offset_end', rb_1.char_offset_end, 'block_content_hash', rb_1.block_content_hash, 'section_number', rb_1.section_number))) AS jsonb_build_object
                   FROM (rosetta_v2513.term_definition td
                     LEFT JOIN rosetta_v2513.hr1_raw_blocks rb_1 ON ((rb_1.id = td.source_block_id)))) unified
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

-- lane-invariant span storage adapters (single copy, no identity swap)
CREATE OR REPLACE FUNCTION rosetta_v2513.rosetta_v25_enrich_objects_with_spans(p_extraction_run_id integer, p_objects jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_object jsonb; v_type text; v_id text; v_metadata jsonb; v_span jsonb; v_steps jsonb; v_step jsonb; v_step_span jsonb; v_new_steps jsonb; v_result jsonb:='[]'::jsonb;
begin
 for v_object in select value from jsonb_array_elements(coalesce(p_objects,'[]'::jsonb)) loop
  v_type:=v_object->>'source_object_type'; v_id:=v_object->>'source_object_id';
  if v_type in ('accountability_route','entity_override','term_definition') then
   v_metadata:=coalesce(v_object->'metadata','{}'::jsonb);
   v_span:=rosetta_v2513.rosetta_v25_span_json(v_type,v_id,coalesce(v_metadata->'source_span','{}'::jsonb));
   v_metadata:=jsonb_set(v_metadata,'{source_span}',v_span,true); v_object:=jsonb_set(v_object,'{metadata}',v_metadata,true);
  elsif v_type='workflow_pipeline' then
   v_steps:=coalesce(v_object#>'{normalized_value,steps}','[]'::jsonb); v_new_steps:='[]'::jsonb;
   for v_step in select value from jsonb_array_elements(v_steps) loop
    v_step_span:=rosetta_v2513.rosetta_v25_span_json('workflow_step',v_step->>'step_id','{}'::jsonb);
    if coalesce(v_step_span->>'span_status','')='resolved' then v_step:=v_step||jsonb_build_object('source_span',v_step_span); end if;
    v_new_steps:=v_new_steps||jsonb_build_array(v_step);
   end loop;
   v_object:=jsonb_set(v_object,'{normalized_value,steps}',v_new_steps,true);
  end if;
  v_result:=v_result||jsonb_build_array(v_object);
 end loop;
 return v_result;
end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.rosetta_v25_span_json(p_object_type text, p_object_id text, p_existing jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select case when span.object_id is null or span.span_status<>'resolved' then coalesce(p_existing,'{}'::jsonb)
 else coalesce(p_existing,'{}'::jsonb)||jsonb_build_object('char_offset_start',span.source_offset_start,'char_offset_end',span.source_offset_end,'raw_text_hash',span.raw_text_hash,'projection_version',span.projection_version,'span_status',span.span_status) end
 from (select 1) anchor left join rosetta_v2513.rosetta_object_source_span span on span.object_type=p_object_type and span.object_id=p_object_id;
$function$;
create or replace view rosetta_v2513.v_rosetta_operator_law_view_v1 as
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
    rosetta_v2513.rosetta_v25_enrich_objects_with_spans(extraction_run_id, objects) AS objects,
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
           FROM (rosetta_v2513.rosetta_structural_representation representation
             LEFT JOIN rosetta_v2513.hr1_raw_blocks block ON ((block.id = representation.source_block_id)))
          WHERE (representation.extraction_run_id = law.extraction_run_id)), '[]'::jsonb) AS structural_representations
   FROM rosetta_v2513.v_civic_genome_law_view_v1_internal law;


-- candidate receipt tables (candidate storage; structurally outside publication)
create table if not exists rosetta_v2513.corpus_measurement_receipt (
    measurement_id     uuid primary key default gen_random_uuid(),
    measured_at        timestamptz not null default now(),
    engine_version     text not null,
    rule_set_version   text not null,
    manifest_hash      text not null,
    scope              text not null,          -- what was measured (table/column)
    sample_size        bigint not null,
    percentiles        jsonb not null,         -- {p50,p90,p99,p999,max}
    bound_chosen       integer not null,
    bound_justification text not null,         -- measurement-derived, never assumed
    receipt_hash       text not null           -- sha256 over canonical receipt fields
);

create table if not exists rosetta_v2513.projection_receipt (
    projection_receipt_id uuid primary key default gen_random_uuid(),
    created_at         timestamptz not null default now(),
    extraction_run_id  integer,
    object_type        text,
    object_id          text,
    raw_sha256         text not null,          -- sha256 of raw source bytes
    projected_sha256   text not null,          -- sha256 of projected text
    projection_method  text not null,          -- e.g. rosetta-layout-projection-v2513c3
    projection_version text not null,
    offset_mapping     jsonb,                  -- null only with declared inability
    offset_mapping_status text not null check (offset_mapping_status in ('preserved','not_preserved_declared')),
    charset_receipt    jsonb not null,
    excluded_regions   jsonb not null,         -- masked/excluded region receipts
    verified           boolean not null        -- true only if recompute matches
);

-- lockdown: candidates readable, never writable by PUBLIC/anon/authenticated
revoke all on schema rosetta_v2513 from public;
grant usage on schema rosetta_v2513 to anon, authenticated;
grant select on all tables in schema rosetta_v2513 to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema rosetta_v2513 from public, anon, authenticated;

-- C1 measurement receipt, populated at build time from the live-corpus
-- distribution captured 2026-08-24 (evidence/measurements/actor-bound-distribution.json).
-- NOTE: the originally specified bound 240 is REFUTED by this measurement
-- (pre-modal p99=254 > 240); 1024 is the smallest power-of-two above p999=571.26.
insert into rosetta_v2513.corpus_measurement_receipt
  (engine_version, rule_set_version, manifest_hash, scope, sample_size,
   percentiles, bound_chosen, bound_justification, receipt_hash)
values (
  'rosetta-v3-deterministic-sql-2.5.11',
  'rosetta-five-layer-structural-correctness-2.5.11',
  'see evidence/registry/manifest-2.5.11.json',
  'workflow_step pre-modal segment length (char_length of text before first shall/must/may in rosetta_v2_normalize_text(step_name))',
  156869,
  '{"p50": 36.0, "p90": 123.0, "p99": 254.0, "p999": 571.26, "max": 6566}'::jsonb,
  1024,
  'Live measurement 2026-08-24 (n=156869): p999=571.26, max=6566. 1024 is the smallest power-of-two strictly above measured p999; it admits >=99.9% of observed legitimate clauses and blocks the runaway-capture tail. The previously specified 240 is refuted by measurement (p99=254 > 240).',
  encode(extensions.digest(convert_to(
    'rosetta-v3-deterministic-sql-2.5.11|pre-modal-segment|156869|p999=571.26|bound=1024',
    'UTF8'),'sha256'),'hex')
);

-- row-level security: SELECT-true policy; write denial enforced by grants
alter table rosetta_v2513.accountability_route enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.accountability_route;
create policy candidate_read_only on rosetta_v2513.accountability_route for select using (true);
alter table rosetta_v2513.actor_alias enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.actor_alias;
create policy candidate_read_only on rosetta_v2513.actor_alias for select using (true);
alter table rosetta_v2513.actor_canon enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.actor_canon;
create policy candidate_read_only on rosetta_v2513.actor_canon for select using (true);
alter table rosetta_v2513.appeal_pathway enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.appeal_pathway;
create policy candidate_read_only on rosetta_v2513.appeal_pathway for select using (true);
alter table rosetta_v2513.corpus enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.corpus;
create policy candidate_read_only on rosetta_v2513.corpus for select using (true);
alter table rosetta_v2513.entity_override enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.entity_override;
create policy candidate_read_only on rosetta_v2513.entity_override for select using (true);
alter table rosetta_v2513.escalation_node enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.escalation_node;
create policy candidate_read_only on rosetta_v2513.escalation_node for select using (true);
alter table rosetta_v2513.extraction_manifest enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.extraction_manifest;
create policy candidate_read_only on rosetta_v2513.extraction_manifest for select using (true);
alter table rosetta_v2513.extraction_rule_manifest enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.extraction_rule_manifest;
create policy candidate_read_only on rosetta_v2513.extraction_rule_manifest for select using (true);
alter table rosetta_v2513.extraction_run enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.extraction_run;
create policy candidate_read_only on rosetta_v2513.extraction_run for select using (true);
alter table rosetta_v2513.extraction_run_config enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.extraction_run_config;
create policy candidate_read_only on rosetta_v2513.extraction_run_config for select using (true);
alter table rosetta_v2513.help_entity enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.help_entity;
create policy candidate_read_only on rosetta_v2513.help_entity for select using (true);
alter table rosetta_v2513.hr1_raw_blocks enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.hr1_raw_blocks;
create policy candidate_read_only on rosetta_v2513.hr1_raw_blocks for select using (true);
alter table rosetta_v2513.layer_coverage enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.layer_coverage;
create policy candidate_read_only on rosetta_v2513.layer_coverage for select using (true);
alter table rosetta_v2513.rosetta_canonical_clause enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_canonical_clause;
create policy candidate_read_only on rosetta_v2513.rosetta_canonical_clause for select using (true);
alter table rosetta_v2513.rosetta_clause_ir enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_clause_ir;
create policy candidate_read_only on rosetta_v2513.rosetta_clause_ir for select using (true);
alter table rosetta_v2513.rosetta_clause_occurrence enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_clause_occurrence;
create policy candidate_read_only on rosetta_v2513.rosetta_clause_occurrence for select using (true);
alter table rosetta_v2513.rosetta_current_generation_registry_v1 enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_current_generation_registry_v1;
create policy candidate_read_only on rosetta_v2513.rosetta_current_generation_registry_v1 for select using (true);
alter table rosetta_v2513.rosetta_object_correction enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_object_correction;
create policy candidate_read_only on rosetta_v2513.rosetta_object_correction for select using (true);
alter table rosetta_v2513.rosetta_object_source_span enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_object_source_span;
create policy candidate_read_only on rosetta_v2513.rosetta_object_source_span for select using (true);
alter table rosetta_v2513.rosetta_structural_repair_queue enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_structural_repair_queue;
create policy candidate_read_only on rosetta_v2513.rosetta_structural_repair_queue for select using (true);
alter table rosetta_v2513.rosetta_structural_representation enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.rosetta_structural_representation;
create policy candidate_read_only on rosetta_v2513.rosetta_structural_representation for select using (true);
alter table rosetta_v2513.source_document enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.source_document;
create policy candidate_read_only on rosetta_v2513.source_document for select using (true);
alter table rosetta_v2513.source_document_content enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.source_document_content;
create policy candidate_read_only on rosetta_v2513.source_document_content for select using (true);
alter table rosetta_v2513.term_definition enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.term_definition;
create policy candidate_read_only on rosetta_v2513.term_definition for select using (true);
alter table rosetta_v2513.term_definition_affected_steps enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.term_definition_affected_steps;
create policy candidate_read_only on rosetta_v2513.term_definition_affected_steps for select using (true);
alter table rosetta_v2513.validation_result enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.validation_result;
create policy candidate_read_only on rosetta_v2513.validation_result for select using (true);
alter table rosetta_v2513.workflow_pipeline enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.workflow_pipeline;
create policy candidate_read_only on rosetta_v2513.workflow_pipeline for select using (true);
alter table rosetta_v2513.workflow_step enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.workflow_step;
create policy candidate_read_only on rosetta_v2513.workflow_step for select using (true);
alter table rosetta_v2513.corpus_measurement_receipt enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.corpus_measurement_receipt;
create policy candidate_read_only on rosetta_v2513.corpus_measurement_receipt for select using (true);
alter table rosetta_v2513.projection_receipt enable row level security;
drop policy if exists candidate_read_only on rosetta_v2513.projection_receipt;
create policy candidate_read_only on rosetta_v2513.projection_receipt for select using (true);
