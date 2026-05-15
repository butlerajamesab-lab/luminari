import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });
import { createConnection } from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  // Parse URL and override database to luminari_registry
  const parsed = new URL(url);
  parsed.pathname = '/luminari_registry';
  const conn = await createConnection(parsed.toString());

  const tables = [
    'legal_statutes','legal_enforcement_records','legal_weak_joints','legal_contradictions','legal_case_law','legal_statute_clauses',
    'doctrine_registry','doctrine_graph_edges','agency_authority_map',
    'litigation_barriers','proof_frameworks',
    'registry_programs','registry_oversight_bodies','registry_jurisdictions','registry_workflows','registry_signals','registry_policy_alerts','registry_source_traceability',
    'agency_performance_metrics','agency_forms','regulatory_guidance','enforcement_priority_index','enforcement_trends',
    'agency_case_prioritization','agency_resource_capacity','agency_intake_rules','interagency_referrals','agency_coordination_matrix',
    'signal_registry','signal_flags','signal_extractions',
    'pattern_types','patterns','pattern_occurrences','pattern_registry',
    'trend_registry','trend_snapshots','trend_forecasts',
    'strategy_paths','strategy_outputs','strategy_registry',
    'outcome_registry','outcome_metrics',
    'remedy_templates','remedy_paths','remedy_steps',
    'knowledge_entries','knowledge_modules','knowledge_coverage_metrics','knowledge_cross_refs','knowledge_freshness',
    'pipeline_intelligence_map','pipeline_events','pipeline_map',
    'docket_entries','docket_actors','docket_impacts','docket_sources','docket_submissions',
    'lighthouse_suggestions','lighthouse_posts','lighthouse_events','lighthouse_spotlight','lighthouse_jobs',
    'benefit_applications',
    'harm_index_scores','harm_index_entities','harm_index_history','harm_map_nodes','harm_map_edges','harm_map_snapshots',
    'risk_forecasts','risk_forecast_history','systemic_risk_forecasts',
    'lobbying_activity','verified_reports','oversight_reports',
    'institution_registry','institution_risk_profiles','institution_activity','institution_annotations',
    'regulatory_capture_metrics','regulatory_capture_patterns','regulatory_capture_signals','regulatory_enforcement_actions',
    'intervention_endpoints','intervention_escalation_rules','intervention_submissions',
    'table_registry','governance_log','governance_snapshots',
    'cases','documents','findings','entities','quotes','relationships',
    'mental_health_resources',
    'contradiction_templates','narrative_templates','workflow_definitions',
    'timeline_rules','timeline_signals','timeline_events',
    'investigative_queries','investigative_results','investigative_reports',
    'simulation_runs','simulation_results',
    'forecast_inputs',
    'lumensend_templates','lumensend_drafts',
    'map_intake_sessions','geocode_cache',
    'foia_statutes','foia_agencies','foia_record_types','foia_agency_records','foia_requests',
    'presentations','presentation_slides',
    'forms_registry',
    'filing_generator',
    'public_reports','public_report_sections','public_report_exports',
    'live_signals','historical_signals',
    'policy_events','policy_pattern_impacts',
    'legislator_contacts',
    'settlement_formulas','settlement_calculations',
    'weak_joint_hits','weak_joint_triggers',
    'evidence_sources',
    'provenance_audit_logs','provenance_alert_events',
    'users','cases','signal_flags',
    'checklist_items','user_feedback','pipeline_events',
    'share_links','notifications','admin_invites',
    'missing_records',
    'ingested_records','ingest_runs',
    'sunam_gate_log','sunam_thresholds',
  ];

  // Deduplicate
  const uniqueTables = [...new Set(tables)];

  const withData = [];
  const empty = [];
  const missing = [];

  for (const t of uniqueTables) {
    try {
      const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${t}\``);
      const cnt = Number(rows[0].cnt);
      if (cnt > 0) {
        withData.push([t, cnt]);
      } else {
        empty.push(t);
      }
    } catch(e) {
      if (e.message.includes("doesn't exist")) {
        missing.push(t);
      } else {
        console.log(`  ${t}: ERR=${e.message.substring(0, 80)}`);
      }
    }
  }

  withData.sort((a, b) => b[1] - a[1]);

  console.log(`=== TABLES WITH DATA (${withData.length}) ===`);
  for (const [t, c] of withData) console.log(`  ${t}: ${c}`);

  console.log(`\n=== EMPTY TABLES (${empty.length}) ===`);
  for (const t of empty) console.log(`  ${t}`);

  console.log(`\n=== MISSING TABLES (${missing.length}) ===`);
  for (const t of missing) console.log(`  ${t}`);

  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
