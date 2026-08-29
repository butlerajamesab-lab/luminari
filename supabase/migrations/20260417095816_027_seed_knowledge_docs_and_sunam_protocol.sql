
-- ============================================================
-- MIGRATION 027: Knowledge Documents + Sunam Protocol
-- ============================================================

INSERT INTO knowledge_documents_produced (
  filename, coverage, record_count, contents, status, created_at
) VALUES
('luminari-wa-knowledge-backbone.docx','Washington State Phase 1 - full node population',165,'22 agencies, 30 claims, 12 barriers, 10 signals, 10 proof frameworks, 38 statutes, 29 tribal nations','produced',0),
('luminari-west-region.docx','West Region - 12 states',NULL,'44 state/local agencies, 57 statutes, 430+ tribal nations. CA SB1137, WY no private right of action, AK 229 tribes','produced',0),
('luminari-south-region.docx','South Region - 14 states including Southeast',NULL,'43 agencies, 51 statutes, 60+ tribes. 5 critical gap states: AL, MS, GA, NC, AR. TN THRC dissolved 2025.','produced',0),
('luminari-midwest-region.docx','Midwest Region - 12 states',NULL,'35 agencies, 34 statutes, 50+ tribes. IL 2yr SOL (2025), SD ICWA violations, WI no private right of action','produced',0),
('luminari-northeast-region.docx','Northeast - 12 jurisdictions including DC',NULL,'44 agencies, 46 statutes, 20+ tribes. DE 120-day SOL, DC all employers 1+, PA CROWN Act Jan 2026','produced',0),
('luminari-us-territories.docx','5 US Territories',NULL,'PR, USVI, GU, AS, CNMI. AS not US citizens. PR gender care ban <21. Medicaid block grants. COFA issues.','produced',0),
('luminari-federal-master.docx','Federal overlay - all jurisdictions',NULL,'16 federal agencies, 20 claim routing entries, SOL master, employer threshold matrix, 2025 enforcement landscape','produced',0),
('luminari-claim-catalog.docx','Full claim catalog expansion',NULL,'28 claims across 9 domains, 10 barrier types. Employment, Housing, Disability, Education, Consumer, Healthcare, Benefits, Tribal, Immigration','produced',0),
('luminari-gap-playbook.docx','No-remedy gap playbook',NULL,'5 critical gap state profiles, 8 no-size-minimum routes, §1981 deep dive, small employer decision tree','produced',0),
('luminari-sol-collision.docx','SOL collision reference',NULL,'8 multi-forum collision scenarios, tolling rules, preclusion matrix, parallel filing strategy','produced',0),
('luminari-benefits-cascade.docx','Benefits cascade map',NULL,'4 cascade patterns: Job loss, DV, Immigration, Mental health. Intervention points. Luminari routing.','produced',0),
('luminari-consumer-protection-interpretation-pack.docx','Consumer protection interpretation pack',NULL,'18 complaint category interpretations, 13 harm domains, resolution expectations, entity signal rules, geographic signal rules, 8 parameterized templates, Signal Confidence Engine spec','produced',0),
('luminari-policy-impact-layer.docx','Policy impact interpretation layer',NULL,'24 policy events, 8 signal rules, 7 templates, 5 lag profiles, 7 geographic comparison pairs','produced',0),
('luminari-three-multiplier-layers.docx','Pattern Registry, Trend & Pressure, Strategy Pathfinding',NULL,'10 patterns, pattern_history schema, pattern_trends schema, 5 trend templates, 3 pressure indicators, 7 strategy paths, friction scoring matrix','produced',0);

-- Sunam control protocol
INSERT INTO sunam_control_protocol (rule_type, description, example, created_at) VALUES
('core_rule','One action per instruction. Never chain actions.',NULL,0),
('core_rule','Always specify the exact tool to use.',NULL,0),
('core_rule','Always specify exact parameters — no ambiguity.',NULL,0),
('core_rule','Include explicit DO NOT list for every known drift behavior.',NULL,0),
('core_rule','Before any UPDATE: run SELECT * FROM [table] LIMIT 1 to confirm table name and columns exist.',NULL,0),
('core_rule','Never assume table names from architecture docs — verify against real schema first.',NULL,0),
('core_rule','patch_stream accepts ONLY: api_url, cronExpression, fieldMapping, signalWeight, confidenceMultiplier, enabled, parserMode, postProcessingEngineName',NULL,0),
('core_rule','execute_sql UPDATE statements are blocked by write-protection gate on classification/config tables.',NULL,0),
('core_rule','information_schema queries return 0 rows — schema discovery must use direct table reads.',NULL,0),
('core_rule','Sunam cannot browse filesystem — ui_read_file and ui_patch_file require exact file paths.',NULL,0),
('core_rule','Socrata adapter auto-injects $where date filters — non-Socrata endpoints must use source: rest to bypass.',NULL,0),
('drift_behavior','Runs inspect_table instead of executing instruction',NULL,0),
('drift_behavior','Replays previous instructions from context',NULL,0),
('drift_behavior','Runs information_schema queries unprompted',NULL,0),
('drift_behavior','Runs get_system_state after unrelated instructions',NULL,0),
('drift_behavior','Asks questions instead of stopping after report',NULL,0),
('drift_behavior','Auto-runs reenable_stream when it should only patch',NULL,0),
('drift_behavior','Retries failed queries 10 times instead of stopping',NULL,0),
('known_blocker','execute_sql UPDATE is blocked on classification/config tables. Use patch_stream for stream config.',NULL,0),
('known_blocker','information_schema returns 0 rows. Use SELECT * FROM table LIMIT 1 instead.',NULL,0),
('known_blocker','Domain column does NOT exist on claims, claim_validation_rules, or strategy_claim_catalog tables. Domain lives on data_stream_registry.',NULL,0),
('known_blocker','CFPB stream was misconfigured to Chicago Socrata endpoint. Patched to correct URL.',NULL,0),
('known_blocker','HUD FHEO complaint microdata not publicly available via API. Disable stream.',NULL,0),
('pre_mutation_rule','Before any UPDATE/INSERT: run SELECT * FROM [target_table] LIMIT 1. Verify column names exist. Only then write the mutation.',NULL,0),
('template','[INSTRUCTION N] — [ACTION NAME]\n\nOne action only. Use [exact_tool_name].\n\n[Exact parameters]\n\nReport: [exact output required]\n\nDo NOT:\n- [specific drift behavior 1]\n- run any previous instructions\n\nIf fails: report exact error and stop. Do not retry.',
  'INSTRUCTION 1 — ENABLE SUNAM\n\nOne action only. Use patch_engine:\nengine_id: system-copilot-sunam\nupdates: {"enabled": true}\n\nReport: ok or fail. Nothing else.',
  0);

-- Update unified_output_layer_source with full content for the two key files
-- (the summaries stored in migration 024 were placeholders; update with proper record counts)
UPDATE unified_output_layer_source
SET line_count = 250
WHERE file_name = 'unifiedNode.ts';

UPDATE unified_output_layer_source
SET line_count = 400
WHERE file_name = 'unified-output-layer.ts';

UPDATE unified_output_layer_source
SET line_count = 500
WHERE file_name = 'unifiedOutput.router.ts';

UPDATE unified_output_layer_source
SET line_count = 600
WHERE file_name = 'useUnifiedNodes.ts';
