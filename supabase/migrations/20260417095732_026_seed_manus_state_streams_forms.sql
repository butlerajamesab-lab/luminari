
-- ============================================================
-- MIGRATION 026: Seed Manus Platform State + Streams + Forms
-- ============================================================

-- Platform state snapshot
INSERT INTO manus_platform_snapshots (
  snapshot_date, platform_url,
  table_count, row_count_approx, trpc_routers, page_components, test_files, engine_stages,
  knowledge_backbone_records, total_cases, total_documents, total_findings,
  total_signals, strong_signals, moderate_signals, preliminary_signals, governed_signals,
  notes, created_at
) VALUES (
  '2026-04-02', 'luminari.manus.space',
  129, 3200000, 65, 72, 141, 29,
  4008, 24964, 23058, 9451,
  9451, 84, 238, 9129, 318,
  'Snapshot from Manus session reference. Context was cleared. Sunam re-enabled. CFPB stream patched.',
  0
);

-- Stream registry
INSERT INTO manus_stream_registry (
  stream_id, stream_name, status, source_type, current_url,
  run_confirmed, action_needed, notes, created_at
) VALUES
('gpri-47xz', 'WA Attorney General Consumer Complaints', 'healthy', 'socrata',
  NULL, TRUE, NULL, 'Primary working dataset. 267,969+ records.', 0),

('j7bt-andi', 'WA Public Disclosure Commission Documents', 'healthy', 'socrata',
  NULL, TRUE, NULL, 'Working.', 0),

('cfpb-complaints', 'CFPB Consumer Complaint Database', 'patched_needs_verify', 'rest',
  'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?format=json&size=100&sort=created_date_desc',
  FALSE,
  'Run stream and verify records ingested > 0',
  'Was pointing at Chicago Socrata endpoint (data.cityofchicago.org/resource/jjzp-q8t2) — patched to correct CFPB URL.', 0),

('eeoc-enforcement', 'EEOC Enforcement Actions', 'patched_needs_verify', 'socrata',
  'https://data.eeoc.gov/resource/6fui-hpss.json?$limit=100&$order=fiscal_year+DESC',
  FALSE, 'Run stream and verify', NULL, 0),

('dol-whd-enforcement', 'DOL Wage and Hour Enforcement', 'patched_needs_verify', 'socrata',
  'https://data.dol.gov/resource/qnm5-5yts.json?$limit=100',
  FALSE, 'Run stream, check if empty is expected or parsing issue',
  'Run returned empty dictionary — may be no recent records or field mismatch. Needs investigation.', 0),

('osha-inspections', 'OSHA Inspection Data', 'patched_needs_verify', 'socrata',
  'https://data.dol.gov/resource/4vsw-q74s.json?$limit=100',
  FALSE, 'Run stream and verify', 'Re-enabled this session.', 0),

('ftc-enforcement', 'FTC Enforcement Actions', 'needs_patching', 'rest',
  'https://www.ftc.gov/api/v0/cases_and_proceedings.json?limit=100',
  FALSE, 'Send patch_stream instruction with correct URL', NULL, 0),

('fec-campaign-finance', 'FEC Campaign Finance Data', 'needs_patching', 'rest',
  'https://api.open.fec.gov/v1/filings/?per_page=100&sort=-receipt_date&api_key=DEMO_KEY',
  FALSE, 'Register API key at api.data.gov, then patch_stream',
  'DEMO_KEY works for low volume (100 req/day). Register for production key.', 0),

('congress-legislation', 'Congressional Legislation Tracker', 'needs_patching', 'rest',
  'https://api.congress.gov/v3/bill?limit=20&api_key=DEMO_KEY',
  FALSE, 'Register API key at api.congress.gov, then patch_stream', NULL, 0),

('scotus-decisions', 'Supreme Court Decisions', 'needs_patching', 'rest',
  'https://www.courtlistener.com/api/rest/v3/opinions/?court=scotus&order_by=-date_created&format=json',
  FALSE, 'patch_stream with CourtListener URL', NULL, 0),

('hud-fheo-complaints', 'HUD Fair Housing Complaints', 'disabled', NULL, NULL,
  FALSE, 'Disable — no viable public API. Revisit when endpoint confirmed.',
  'HUD FHEO complaint microdata NOT publicly available via API.', 0);

-- Forms gap registry — all 8 workflows, all critical
INSERT INTO forms_gap_registry (
  workflow_id, jurisdiction, form_category, required, critical,
  description, expected_agency, expected_form_id, filing_format, typical_deadline,
  statute_reference, status, created_at
) VALUES
-- INSURANCE DENIAL
('insurance_denial','Multi-state','COMPLAINT_FORM',TRUE,TRUE,'Insurance claim denial complaint form','State Insurance Department / Insurance Commissioner',NULL,'Letter / Form submission','1-3 years from denial date',NULL,'NOT_FOUND',0),
('insurance_denial','Multi-state','APPEAL_FORM',TRUE,TRUE,'Internal appeal form for insurance claim denial','Insurance company / State regulator',NULL,'Form or letter','30-60 days from denial',NULL,'NOT_FOUND',0),
('insurance_denial','Multi-state','FILING_INSTRUCTIONS',TRUE,TRUE,'Step-by-step filing procedures and agency contact info','State DOI website',NULL,NULL,NULL,NULL,'NOT_FOUND',0),

-- CA INSURANCE DENIAL
('ca_insurance_denial','California','COMPLAINT_FORM',TRUE,TRUE,'California Department of Insurance complaint form','California Department of Insurance (CDI)','CDI-COMPLAINT or similar','Online, mail, or in-person','1 year from discovery',NULL,'NOT_FOUND',0),
('ca_insurance_denial','California','APPEAL_FORM',TRUE,TRUE,'CA insurance appeal/review request form','California DOI',NULL,NULL,'30 days from denial',NULL,'NOT_FOUND',0),
('ca_insurance_denial','California','REGULATORY_FILING',TRUE,TRUE,'Unfair Claims Settlement Practices complaint form','California DOI',NULL,NULL,NULL,'California Insurance Code § 791-791.28','NOT_FOUND',0),

-- HOUSING VIOLATION
('housing_violation','Multi-state','COMPLAINT_FORM',TRUE,TRUE,'Housing code violation / habitability complaint form','Local housing authority / code enforcement',NULL,'Online or in-person','Ongoing right to file',NULL,'NOT_FOUND',0),
('housing_violation','Multi-state','REPAIR_DEMAND',FALSE,TRUE,'Formal repair demand letter template','Legal aid / housing rights org',NULL,NULL,NULL,NULL,'NOT_FOUND',0),
('housing_violation','Multi-state','FILING_INSTRUCTIONS',TRUE,TRUE,'Agency contact and filing procedures','Local/state housing department',NULL,NULL,NULL,NULL,'NOT_FOUND',0),

-- CA HOUSING VIOLATION
('ca_housing_violation','California','COMPLAINT_FORM',TRUE,TRUE,'California housing habitability complaint form','City/county code enforcement or housing authority',NULL,'Online, phone, or in-person','Ongoing',NULL,'NOT_FOUND',0),
('ca_housing_violation','California','NOTICE_TO_REPAIR',TRUE,TRUE,'CA Civil Code § 1942.5 repair demand notice','Landlord',NULL,NULL,'Served before repair or deduction claim','CA Civil Code § 1942.5','NOT_FOUND',0),
('ca_housing_violation','California','RENT_WITHHOLDING',FALSE,TRUE,'Rent withholding/repair credit notice and procedure','Legal aid or tenant rights organization',NULL,NULL,NULL,'CA Civil Code § 1942-1942.5','NOT_FOUND',0),

-- WAGE THEFT
('wage_theft','Multi-state','COMPLAINT_FORM',TRUE,TRUE,'Wage complaint form / intake form','State Department of Labor / Wage and Hour Division',NULL,'Online, mail, or in-person','2-3 years from incident',NULL,'NOT_FOUND',0),
('wage_theft','Multi-state','WAGE_CALCULATION',TRUE,TRUE,'Wage calculation worksheet or documentation template','Labor department or legal aid',NULL,NULL,NULL,NULL,'NOT_FOUND',0),
('wage_theft','Multi-state','FILING_INSTRUCTIONS',TRUE,TRUE,'Wage claim procedures and agency contact information','State DOL website',NULL,NULL,NULL,NULL,'NOT_FOUND',0),

-- CA WAGE THEFT
('ca_wage_theft','California','COMPLAINT_FORM',TRUE,TRUE,'California DLSE wage claim form','California Division of Labor Standards Enforcement (DLSE)','DLSE-9 or online portal intake','Online, mail, or in-person','3 years from violation date',NULL,'NOT_FOUND',0),
('ca_wage_theft','California','NOTICE_TO_EMPLOYEE',TRUE,TRUE,'Wage notice requirements / itemized statement documentation','DLSE or legal aid',NULL,NULL,NULL,'CA Labor Code § 226','NOT_FOUND',0),
('ca_wage_theft','California','APPEAL_PROCEDURE',FALSE,TRUE,'Appeal procedures if initial determination unfavorable','California DLSE',NULL,NULL,NULL,NULL,'NOT_FOUND',0),

-- BENEFITS DENIAL
('benefits_denial','Multi-state','APPEAL_FORM',TRUE,TRUE,'Benefits appeal request form','State benefits agency (varies by benefit type)',NULL,'Letter or form submission','10-30 days from denial notice',NULL,'NOT_FOUND',0),
('benefits_denial','Multi-state','REQUEST_FOR_HEARING',FALSE,TRUE,'Administrative hearing request form','State hearing officer',NULL,NULL,'Within appeal period',NULL,'NOT_FOUND',0),
('benefits_denial','Multi-state','FILING_INSTRUCTIONS',TRUE,TRUE,'Benefits appeal procedures and agency contact info','Benefits agency denial notice / website',NULL,NULL,NULL,NULL,'NOT_FOUND',0),

-- CA BENEFITS DENIAL
('ca_benefits_denial','California','UNEMPLOYMENT_APPEAL',TRUE,TRUE,'California EDD unemployment benefits appeal form','California Employment Development Department (EDD)','DE 1000 or online portal',NULL,'30 days from determination',NULL,'NOT_FOUND',0),
('ca_benefits_denial','California','MEDI_CAL_APPEAL',FALSE,TRUE,'Medi-Cal benefits appeal form','California DHCS or local county',NULL,NULL,'90 days from adverse action',NULL,'NOT_FOUND',0),
('ca_benefits_denial','California','CALWORKS_APPEAL',FALSE,TRUE,'CalWORKs benefits appeal form','California DHCS',NULL,NULL,'90 days from adverse action',NULL,'NOT_FOUND',0);

-- Core feedback loop spec
INSERT INTO feedback_loop_spec (
  spec_id, description, status, steps,
  test_pattern_id, test_jurisdiction, test_claim_type,
  validation_criteria, before_state, after_state, created_at
) VALUES (
  'core-feedback-loop-v1',
  'Connects signal → pattern → feedback → strategy → user output. The architectural connection that makes Luminari a navigation engine rather than analysis platform.',
  'not_implemented',
  '[
    {"step":1,"action":"After patternEngine.generateSystemicInferences completes, call patternEngine.getSystemicInferences","filter":"confidence >= 0.70, active/confirmed only"},
    {"step":2,"action":"For each inference, write to patternFeedbackLoop table","fields":["pattern_id","jurisdiction","related_claims","related_agencies","confidence"]},
    {"step":3,"action":"Modify strategyEngine.getStrategyPaths to check patternFeedbackLoop for matches","match_rule":"feedback.jurisdiction == case.jurisdiction AND harm domain overlaps OR related_claims overlaps case claim types"},
    {"step":4,"action":"If match found, append Pattern Context to returned path objects","fields":["pattern_name","complaint_count","confidence_score","related_agencies_impact"],"if_no_match":"Return path objects unchanged. No error."},
    {"step":5,"action":"Render Pattern Context in GuidedDashboard.tsx as inline callout beneath path title","render_location":"Per path card that has match. NOT a global banner."}
  ]'::jsonb,
  'PAT-557', 'WA', 'wage_theft',
  ARRAY[
    'Feedback loop row exists for PAT-557',
    'WA wage_theft case receives Pattern Context field in strategy output',
    'Strategy output is user-visible and structurally correct',
    'Cases without pattern match are unaffected'
  ],
  'Signal detected: repeat company',
  'Pattern detected: Wage Theft at Small Employers — 43 similar cases — your case matches',
  0
);
