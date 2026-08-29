create or replace view public.v_lighthouse_signal_catalog_v1 as
select
  'registry:'||id::text as signal_uid,
  'signal_registry'::text as source_lane,
  signal_type,
  signal_type as title,
  domain,
  null::text as jurisdiction,
  severity,
  explanation as description,
  null::text as confidence,
  to_timestamp(nullif(created_at,0)::double precision/1000.0) as detected_at,
  jsonb_build_object('trigger_patterns',trigger_patterns,'linked_doctrine',linked_doctrine,'linked_weak_joints',linked_weak_joints,'linked_contradiction_templates',linked_contradiction_templates,'recommended_next_steps',recommended_next_steps,'cluster_id',cluster_id,'route_to_pattern_engine',route_to_pattern_engine,'route_to_strategy_engine',route_to_strategy_engine,'route_to_procedural_engine',route_to_procedural_engine) as detail
from public.signal_registry
union all
select
  'detected:'||id::text,
  'detected_signals',
  signal_type,
  coalesce(title,signal_type),
  domain,
  coalesce(jurisdiction,jurisdiction_scope,geographic_focus),
  coalesce(severity,severity_level),
  coalesce(nullif(plain_language_explanation,''),nullif(signal_description,''),nullif(explanation,''),pattern_summary),
  coalesce(confidence_score::text,confidence_score_raw),
  to_timestamp(coalesce(nullif(detected_at,0),nullif(detection_timestamp,0),nullif(created_at,0))::double precision/1000.0),
  jsonb_build_object('case_id',case_id,'dataset_id',dataset_id,'supporting_statistics',supporting_statistics,'pattern_summary',pattern_summary,'approval_status',approval_status,'escalation_status',escalation_status,'review_notes',review_notes,'source_record_ids',source_record_ids,'entity_id',entity_id,'entity_role',entity_role,'affected_entities',affected_entities,'observed_value',observed_value,'expected_value',expected_value,'threshold_value',threshold_value,'percentage_change',percentage_change,'finding_id',finding_id,'snapshot_id',snapshot_id,'pipeline_run_id',pipeline_run_id)
from public.detected_signals
union all
select
  'live_data:'||live_data_signal_id::text,
  'live_data_signals',
  signal_type,
  coalesce(title,signal_type),
  null::text,
  jurisdiction_id,
  severity,
  description,
  confidence_score::text,
  detected_at,
  jsonb_build_object('primary_stream_id',primary_stream_id,'source_event_refs',source_event_refs,'entity_ids',entity_ids,'entity_resolution_status',entity_resolution_status,'verification_state',verification_state,'supporting_statistics',supporting_statistics,'evidence_refs',evidence_refs,'detection_rule_id',detection_rule_id,'detection_rule_version',detection_rule_version,'engine_id',engine_id,'engine_version',engine_version,'input_hash',input_hash,'signal_hash',signal_hash,'governance_status',governance_status,'is_current',is_current,'atlas_candidate_id',atlas_candidate_id,'atlas_semantic_key',atlas_semantic_key)
from public.live_data_signals
union all
select
  'canonical:'||id::text,
  'canonical_signal_registry',
  signal_type,
  signal_type,
  source_layer,
  array_to_string(jurisdiction_scope,','),
  severity,
  coalesce(metadata->>'description',run_context->>'description',signal_type),
  null::text,
  created_at,
  jsonb_build_object('canonical_key',canonical_key,'constitutional_alignment',constitutional_alignment,'verification_state',verification_state,'provenance_complete',provenance_complete,'deterministic',deterministic,'jurisdiction_scope',jurisdiction_scope,'run_context',run_context,'metadata',metadata,'deterministic_hash',deterministic_hash,'created_by',created_by)
from public.canonical_signal_registry;
