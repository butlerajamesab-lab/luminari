-- Operational Core Health & Visibility Views
-- Date: 2026-05-11
--
-- Historical deployments contain an uneven subset of the source relations.
-- Create each summary only when every relation referenced by that view exists.
-- This keeps migration replay non-destructive and prevents obsolete relation
-- names from blocking protected-branch synchronization.

DO $migration$
BEGIN
  IF to_regclass('public.namespace_activation_registry') IS NOT NULL THEN
    EXECUTE $view$
      create or replace view public.v_operational_core_namespace_status as
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
      from public.namespace_activation_registry nar
    $view$;
  END IF;

  IF to_regclass('public.metadata_machines') IS NOT NULL
     AND to_regclass('public.machine_outputs') IS NOT NULL
     AND to_regclass('public.governance_log') IS NOT NULL
     AND to_regclass('public.pipeline_runs') IS NOT NULL THEN
    EXECUTE $view$
      create or replace view public.v_operational_core_governance_summary as
      select
        (select count(*) from public.metadata_machines) as machine_count,
        (select count(*) from public.machine_outputs) as machine_output_count,
        (select count(*) from public.governance_log) as governance_event_count,
        (select count(*) from public.pipeline_runs) as pipeline_run_count,
        now() as generated_at
    $view$;
  END IF;

  IF to_regclass('public.legal_statutes') IS NOT NULL
     AND to_regclass('public.legal_case_law') IS NOT NULL
     AND to_regclass('public.legal_definitions') IS NOT NULL
     AND to_regclass('public.legal_enforcement_records') IS NOT NULL
     AND to_regclass('public.legal_weak_joints') IS NOT NULL THEN
    EXECUTE $view$
      create or replace view public.v_operational_core_legal_summary as
      select
        (select count(*) from public.legal_statutes) as statute_count,
        (select count(*) from public.legal_case_law) as case_law_count,
        (select count(*) from public.legal_definitions) as definition_count,
        (select count(*) from public.legal_enforcement_records) as enforcement_record_count,
        (select count(*) from public.legal_weak_joints) as weak_joint_count,
        now() as generated_at
    $view$;
  END IF;

  IF to_regclass('public.civil_gideon_directory') IS NOT NULL
     AND to_regclass('public.national_resources') IS NOT NULL
     AND to_regclass('public.agency_directory') IS NOT NULL
     AND to_regclass('public.forms_directory') IS NOT NULL
     AND to_regclass('public.remedy_templates') IS NOT NULL THEN
    EXECUTE $view$
      create or replace view public.v_operational_core_resource_summary as
      select
        (select count(*) from public.civil_gideon_directory) as civil_gideon_count,
        (select count(*) from public.national_resources) as national_resource_count,
        (select count(*) from public.agency_directory) as agency_count,
        (select count(*) from public.forms_directory) as forms_count,
        (select count(*) from public.remedy_templates) as remedy_template_count,
        now() as generated_at
    $view$;
  END IF;

  IF to_regclass('public.detected_signals') IS NOT NULL
     AND to_regclass('public.signal_events') IS NOT NULL
     AND to_regclass('public.streams') IS NOT NULL
     AND to_regclass('public.prime_patterns') IS NOT NULL
     AND to_regclass('public.civic_map_signals') IS NOT NULL THEN
    EXECUTE $view$
      create or replace view public.v_operational_core_signal_summary as
      select
        (select count(*) from public.detected_signals) as detected_signal_count,
        (select count(*) from public.signal_events) as signal_event_count,
        (select count(*) from public.streams) as stream_count,
        (select count(*) from public.prime_patterns) as prime_pattern_count,
        (select count(*) from public.civic_map_signals) as civic_map_signal_count,
        now() as generated_at
    $view$;
  END IF;

  IF to_regclass('public.atlas_lighthouse_signal_bridge_v1') IS NOT NULL
     AND to_regclass('public.atlas_lighthouse_resource_bridge_v1') IS NOT NULL
     AND to_regclass('public.atlas_lighthouse_judicial_signal_bridge_v1') IS NOT NULL
     AND to_regclass('public.atlas_lighthouse_legal_bridge_v1') IS NOT NULL THEN
    EXECUTE $view$
      create or replace view public.v_operational_core_bridge_summary as
      select
        (select count(*) from public.atlas_lighthouse_signal_bridge_v1) as atlas_signal_bridge_count,
        (select count(*) from public.atlas_lighthouse_resource_bridge_v1) as atlas_resource_bridge_count,
        (select count(*) from public.atlas_lighthouse_judicial_signal_bridge_v1) as atlas_judicial_bridge_count,
        (select count(*) from public.atlas_lighthouse_legal_bridge_v1) as atlas_legal_bridge_count,
        now() as generated_at
    $view$;
  END IF;
END
$migration$
