
ALTER TABLE knowledge_documents
  DROP CONSTRAINT knowledge_documents_category_check;

ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_category_check
  CHECK (category IN ('schema','router','engine','spec','blueprint','migration','seed','ui_component','knowledge_backbone','policy','legal','research','architecture','test','config','ui_architecture','knowledge','other'));

INSERT INTO knowledge_documents (
  filename, file_type, category, summary, tags,
  source_thread, is_active, created_at, updated_at
) VALUES

('systemic-risk-forecast.ts', 'ts', 'engine',
  'Systemic Risk Forecast engine — ACTUAL SOURCE CODE (368 LOC). classifyRiskLevel(score) → critical/high/elevated/moderate/low. assignScenarioLabel(riskLevel, drivers) → Regulatory Collapse/Consumer Crisis/Legal Cascade/Systemic Failure/Accelerating Harm/Contagion Risk/Escalation Warning/Watch Zone/Early Signal/Baseline. 6-input weighted risk scoring: complaintVolume(0.20), complaintAcceleration(0.15), litigationVolume(0.15), enforcementActivity(0.15), trendPressure(0.20), geographicSpread(0.15). Forecast windows: 30/90/180/365 days. Reads: systemicRiskForecasts, forecastInputs, riskForecastHistory, patternRegistry, detectedSignals, trendPressureMetrics.',
  ARRAY['L7','risk_forecast','systemic_risk','actual_source','typescript','built_in_codebase'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('luminari-mh-registry.jsx', 'jsx', 'engine',
  'MH Registry Build Engine — FULL SOURCE (claude_generated). Jurisdiction-by-jurisdiction AI-powered builder for mental health resources. 57 jurisdictions queued (all 50 states + DC + 5 territories + CNMI). 11 categories: crisis, mobile_crisis, inpatient, outpatient_community, substance_use, veteran, youth_adolescent, domestic_violence_trauma, legal_aid, tribal, urban_indian. Storage persistence via window.storage. Queue management with status tracking. Section-labeled JSON output. Calls Anthropic API claude-sonnet. Ready to run.',
  ARRAY['L3','mh_registry','claude_generated','jsx','knowledge_backbone'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('luminari-mh-architecture.jsx', 'jsx', 'architecture',
  'MH Registry Architecture — 4-tab integration diagram (claude_generated). Shows how MH registry integrates into Luminari: (1) Build tab — AI-powered generation loop, (2) Review tab — validate generated resources, (3) Deploy tab — push to Supabase/production DB, (4) Monitor tab — track coverage gaps.',
  ARRAY['L3','mh_registry','architecture','claude_generated','jsx'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('LUMINARI_UI_ARCHITECTURE_BUTTONS_ACTIONS.md', 'md', 'ui_architecture',
  'Complete UI button/action map for all 91 Luminari pages (2052 lines). Every button, link, and clickable action across all pages. Each action shows: button label → action type → tRPC call or route. Pages covered: ActionPath, ActivationControl, AdminAnalytics, AgencyMetrics, AnomalyViewfinder, ArchitectureMap, AuditTrail, BenefitsNavigator, Case, CaseRepair, CdaRunDetail, CdaRunList, Chat, CivicMap, CivilGideon, ClaimDenialAnalysis, ClaimElements, CommandBoard, ContradictionScoring, ControlRoom, DeadlineCalculator, DiscoverBenefits, DocketRoom, DoctrineGraph, Documents, EnforcementIntel, EnforcementPathway, Entities, EntityDedup, EntityDetail, EvidenceLab, FilingGenerator, Findings, FoiaTracking, GovernanceDashboard, GuidedDashboard, GuidedIntake, Home, Intake, IntegrityDashboard, InvestigationWorkflow, KnowledgePopulation, LegalLibrary, Lighthouse, LitigationBarriers, LumenSendPage, MentalHealth, MissionControl, Patterns, ProofFrameworks, Provenance, SignalRegistry, SovereignControl, SpineViewer, StatementOfFacts, Timeline, Upload, Verify, Welcome, WorkbenchDashboard, WorkshopFloor, + 30 more.',
  ARRAY['ui_architecture','buttons','actions','91_pages','production_map'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('LUMINARI_COMPLETE_FILE_INDEX.md', 'md', 'architecture',
  'Complete file index: 261 files, 98,873 total lines. Covers: package.json, tsconfig.json, vite.config.ts, client entry/routing (App.tsx 302 LOC), client lib/utilities (panelRegistry.ts 896 LOC, voice/narrativeSynthesis.ts 327 LOC, voiceAdapter.ts 352 LOC), client contexts, client hooks, server core infrastructure (_core/llm.ts 483 LOC, _core/sdk.ts 315 LOC, _core/voiceTranscription.ts 284 LOC), server/routers.ts (4895 LOC — V3 monolith version), all 91 client pages listed with line counts. NOTE: current system has 82 separate router files; routers.ts here is the V3 version.',
  ARRAY['architecture','file_index','261_files','98873_lines'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('claim-elements-validation-example.json', 'json', 'knowledge',
  'Claim validation example: wage_theft case, 60 hours/week, 10 weeks unpaid at restaurant. Element-level output: employer_employee_relationship(0.95, PROVEN), work_performed(0.65, NEEDS_EVIDENCE — recommend timesheet+coworker), unpaid_or_underpaid(0.90, PROVEN), statutory_minimum_wage_applies(0.95, PROVEN). STRONG CLAIM — 3/4 elements proven. File DOL complaint (federal) or state labor board (faster in CA/NY/WA). This is the canonical validation example for the Investigation Workflow.',
  ARRAY['claim_validation','wage_theft','example','L3'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0);
