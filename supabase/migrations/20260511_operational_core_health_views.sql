-- Operational Core Health & Visibility Views
-- Date: 2026-05-11

create or replace view v_operational_core_namespace_status as
select
  nar.namespace_key,
  nar.activation_status,
  nar.activation_classification,
  nar.layer_owner,
  nar.runtime_notes,
  case
    when nar.activation_classification = 'SAFE_TO_ACTIVATE' then true
    else false
  end as safe_runtime_activation,
  nar.created_at
from namespace_activation_registry nar;

create or replace view v_operational_core_governance_summary as
select
  (select count(*) from metadata_machines) as machine_count,
  (select count(*) from machine_outputs) as machine_output_count,
  (select count(*) from governance_log) as governance_event_count,
  (select count(*) from pipeline_runs) as pipeline_run_count,
  now() as generated_at;

create or replace view v_operational_core_legal_summary as
select
  (select count(*) from legal_statutes) as statute_count,
  (select count(*) from legal_case_law) as case_law_count,
  (select count(*) from legal_definitions) as definition_count,
  (select count(*) from legal_enforcement_records) as enforcement_record_count,
  (select count(*) from legal_weak_joints) as weak_joint_count,
  now() as generated_at;

create or replace view v_operational_core_resource_summary as
select
  (select count(*) from civil_gideon_directory) as civil_gideon_count,
  (select count(*) from national_resources) as national_resource_count,
  (select count(*) from agency_directory) as agency_count,
  (select count(*) from forms_directory) as forms_count,
  (select count(*) from remedy_templates) as remedy_template_count,
  now() as generated_at;

create or replace view v_operational_core_signal_summary as
select
  (select count(*) from detected_signals) as detected_signal_count,
  (select count(*) from signal_events) as signal_event_count,
  (select count(*) from streams) as stream_count,
  (select count(*) from prime_patterns) as prime_pattern_count,
  (select count(*) from civic_map_signals) as civic_map_signal_count,
  now() as generated_at;

create or replace view v_operational_core_bridge_summary as
select
  (select count(*) from atlas_lighthouse_signal_bridge_v1) as atlas_signal_bridge_count,
  (select count(*) from atlas_lighthouse_resource_bridge_v1) as atlas_resource_bridge_count,
  (select count(*) from atlas_lighthouse_judicial_signal_bridge_v1) as atlas_judicial_bridge_count,
  (select count(*) from atlas_lighthouse_legal_bridge_v1) as atlas_legal_bridge_count,
  now() as generated_at;
