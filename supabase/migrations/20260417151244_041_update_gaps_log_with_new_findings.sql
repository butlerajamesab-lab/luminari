
-- ============================================================
-- MIGRATION 041: Update gaps log with new findings from this drop
-- Legal library gaps, state registry gaps, knowledge backbone gaps
-- ============================================================

INSERT INTO architecture_gaps_log (gap_id, gap_type, description, source) VALUES
('GAP_CASE_LAW_TABLE_EMPTY','data','legal_case_law table has 0 entries. Entire table empty. Highest priority enrichment target per Legal_Library_Enrichment_Brief. 347 statutes seeded, 255 enforcement records, 536 weak joints, 30 contradictions — but case law is zero.','Legal_Library_Enrichment_Brief.md 2026-03-10'),
('GAP_REMEDY_FEASIBILITY_RULES','data','Remedy feasibility rules: only 5 records, target 40+. Schema defined (remedyType, claimType, jurisdiction, feasibilityScore, requiredElements, disqualifyingFactors, typicalTimelineMonths, successRatePct). Cover: fair housing, employment discrimination, wage theft, consumer fraud, civil rights (42 USC 1983).','Knowledge_Backbone_Population_Worker_Prompt.md'),
('GAP_WEAK_JOINT_REGISTRY','data','Weak joint registry: 0 records, target 30+. Schema defined (claimType, weakJointLabel, description, attackVector, mitigationStrategy, severity, affectedPipelineStage). Min 5 per claim type, 3 critical severity records.','Knowledge_Backbone_Population_Worker_Prompt.md'),
('GAP_STATE_REGISTRY_FL_NY_TX','data','FL, NY, TX have zero engine presence despite full research documents existing. Three largest US states with no Luminari coverage. Full ingestion required from scratch for each.','Luminari_Registry_Gap_Analysis_1.md 2026-03-06'),
('GAP_STATE_REGISTRY_AZ_CA_OR','data','AZ, CA, OR are partial — have programs and oversight chains but empty Layer 0/1 data. Navigation contacts not ingested for any of these states.','Luminari_Registry_Gap_Analysis_1.md 2026-03-06'),
('GAP_NAVIGATION_CONTACTS_ALL_STATES','data','Navigation contacts (direct human escalation contacts at agencies) not ingested for any state including WA, MO, PA. Listed at end of each state research document but not yet translated to structured data.','Luminari_Registry_Gap_Analysis_1.md 2026-03-06'),
('GAP_STATUTE_CITATIONS_347_ENTRIES','data','347 statute entries exist but missing real statute citations (e.g., actual 42 U.S.C. § 1983 citation numbers), full text summaries, and effective dates. Structural scaffolding exists but no authoritative citations.','Legal_Library_Enrichment_Brief.md 2026-03-10'),
('GAP_MANUS_TiDB_339_MISSING_TABLES','schema','MANUS TiDB database (AXzmPhCfhqjYYjh6uJijzm) had only 4 tables vs 343 defined in schema.ts as of 2026-04-02 audit. 339 tables missing. 80+ tRPC routers reference missing tables. This is the primary Manus production database gap, separate from this Supabase project.','LUMINARI_REGISTRY_TABLE_MAPPING_INTEGRITY_AUDIT.md 2026-04-02')
ON CONFLICT (gap_id) DO NOTHING;

-- Update the pattern feedback loop gap with more detail
UPDATE architecture_gaps_log
SET description = 'patternFeedbackLoop table has NEVER been written to. Core loop PAT-557 spec defined but not implemented. 5-step spec: (1) After patternEngine.generateSystemicInferences → filter confidence >= 0.70, (2) For each inference: write to patternFeedbackLoop (pattern_id, jurisdiction, related_claims, related_agencies, confidence), (3) strategyEngine.getStrategyPaths: check patternFeedbackLoop for matching rows, (4) If match: append patternContext field (pattern name, complaint count, confidence, agency impact), (5) Render in GuidedDashboard.tsx as inline callout on matching path cards only. Before: ''Signal detected: repeat company.'' After: ''Pattern detected: Wage Theft at Small Employers — 43 similar cases — your case matches.'' This is the threshold gap between analysis platform and navigation engine.'
WHERE gap_id = 'GAP_PATTERN_FEEDBACK_LOOP_EMPTY';

