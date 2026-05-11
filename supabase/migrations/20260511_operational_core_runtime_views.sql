-- Operational Core Runtime-Facing Projection Views
-- Date: 2026-05-11

create or replace view v_mission_control_runtime as
select
  g.machine_count,
  g.machine_output_count,
  g.governance_event_count,
  g.pipeline_run_count,
  l.statute_count,
  l.case_law_count,
  r.civil_gideon_count,
  r.national_resource_count,
  s.detected_signal_count,
  s.stream_count,
  b.atlas_signal_bridge_count,
  b.atlas_resource_bridge_count,
  now() as generated_at
from v_operational_core_governance_summary g,
     v_operational_core_legal_summary l,
     v_operational_core_resource_summary r,
     v_operational_core_signal_summary s,
     v_operational_core_bridge_summary b;

create or replace view v_legal_library_runtime as
select
  ls.id,
  ls.jurisdiction,
  ls.statute_ref,
  ls.title,
  ls.metadata,
  ls.created_at
from legal_statutes ls;

create or replace view v_case_law_runtime as
select
  lcl.id,
  lcl.jurisdiction,
  lcl.citation,
  lcl.title,
  lcl.metadata,
  lcl.created_at
from legal_case_law lcl;

create or replace view v_civil_gideon_runtime as
select
  cgd.id,
  cgd.organization_name,
  cgd.jurisdiction,
  cgd.service_area,
  cgd.metadata,
  cgd.created_at
from civil_gideon_directory cgd;

create or replace view v_agency_directory_runtime as
select
  ad.id,
  ad.agency_name,
  ad.jurisdiction,
  ad.metadata,
  ad.created_at
from agency_directory ad;

create or replace view v_signal_runtime as
select
  ds.id,
  ds.signal_type,
  ds.confidence_score,
  ds.signal_payload,
  ds.created_at
from detected_signals ds;

create or replace view v_pattern_runtime as
select
  pp.id,
  pp.pattern_key,
  pp.pattern_payload,
  pp.created_at
from prime_patterns pp;

create or replace view v_civic_map_runtime as
select
  cms.id,
  cms.signal_type,
  cms.geographic_entity,
  cms.confidence_score,
  cms.signal_payload,
  cms.created_at
from civic_map_signals cms;

create or replace view v_atlas_bridge_runtime as
select
  'signal' as bridge_type,
  alsb.id,
  alsb.atlas_signal_id as bridge_key,
  alsb.bridge_payload,
  alsb.created_at
from atlas_lighthouse_signal_bridge_v1 alsb

union all

select
  'resource' as bridge_type,
  alrb.id,
  alrb.atlas_resource_id as bridge_key,
  alrb.bridge_payload,
  alrb.created_at
from atlas_lighthouse_resource_bridge_v1 alrb

union all

select
  'judicial' as bridge_type,
  aljb.id,
  aljb.atlas_judicial_signal_id as bridge_key,
  aljb.bridge_payload,
  aljb.created_at
from atlas_lighthouse_judicial_signal_bridge_v1 aljb

union all

select
  'legal' as bridge_type,
  allb.id,
  allb.atlas_legal_id as bridge_key,
  allb.bridge_payload,
  allb.created_at
from atlas_lighthouse_legal_bridge_v1 allb;
