
-- ============================================================
-- MIGRATION 031: Seed remedy template + core workflows
-- ============================================================

-- Wage theft demand letter template
INSERT INTO remedy_templates (
  template_id, template_name, template_type, claim_type, jurisdiction,
  template_body, placeholder_fields, governing_law,
  success_rate, average_settlement, version, created_at
) VALUES (
  'LS_WAGE_001_FED',
  'Wage Theft Demand Letter - Federal FLSA',
  'demand_letter',
  'wage_theft',
  'federal',
  '[DATE]

[EMPLOYER_NAME]
[EMPLOYER_ADDRESS]

Re: Demand for Payment of Unpaid Wages — [CLIENT_NAME]

Dear [EMPLOYER_NAME]:

I write on behalf of [CLIENT_NAME] to demand immediate payment of wages owed for work performed during the period [DATES_WORKED]. During this period, [CLIENT_NAME] was paid [AMOUNT_PAID] but is owed [WAGES_OWED].

This amount includes:
[ ] Unpaid minimum wages: $[AMOUNT]
[ ] Unpaid overtime (1.5x for hours over 40/week): $[AMOUNT]
[ ] Other unpaid compensation: $[AMOUNT]

LEGAL BASIS: Failure to pay minimum wage and overtime violates the Fair Labor Standards Act, 29 USC §201 et seq. Willful violations subject the employer to liquidated damages equal to the unpaid wages.

DEMAND: Please remit payment of $[TOTAL_WAGES_OWED] to [CLIENT_NAME] no later than [PAYMENT_DEADLINE]. If payment is not received, [CLIENT_NAME] will file complaints with the U.S. Department of Labor Wage and Hour Division and will pursue civil litigation including recovery of attorney fees.

Respectfully,
[COUNSEL_NAME]
[COUNSEL_CONTACT]',
  '["DATE","EMPLOYER_NAME","EMPLOYER_ADDRESS","CLIENT_NAME","DATES_WORKED","AMOUNT_PAID","WAGES_OWED","TOTAL_WAGES_OWED","PAYMENT_DEADLINE","COUNSEL_NAME","COUNSEL_CONTACT"]'::jsonb,
  '["29 USC §201","29 USC §216(b)"]'::jsonb,
  0.65, 8500.00, 1, 0
);

-- Core workflows — 8 critical unmapped workflows from forms gap registry
INSERT INTO workflows (
  workflow_id, workflow_name, claim_type, jurisdiction, domain,
  steps, estimated_timeline, success_rate, created_at
) VALUES

('wage_theft_dol_federal', 'Federal Wage Theft — DOL WHD Complaint',
  'wage_theft', 'federal', 'employment',
  '[
    {"step":1,"title":"Document wage discrepancy","description":"Calculate exact hours worked vs paid. Gather pay stubs, timesheets, bank records."},
    {"step":2,"title":"Send demand letter","description":"Send FLSA demand letter to employer with 10-day response deadline.","template_id":"LS_WAGE_001_FED"},
    {"step":3,"title":"File WHD complaint","description":"File online at dol.gov/agencies/whd/contact/complaints or call 1-866-4-US-WAGE.","agency":"DOL Wage and Hour Division","deadline":"2 years from violation (3 for willful)"},
    {"step":4,"title":"WHD investigation","description":"WHD investigates, attempts conciliation. If unsuccessful, refers to litigation."},
    {"step":5,"title":"Recovery","description":"Back wages + equal liquidated damages + attorney fees if litigation proceeds."}
  ]'::jsonb,
  '3-18 months', 0.55, 0),

('wage_theft_ca_dlse', 'California Wage Theft — DLSE Claim',
  'wage_theft', 'CA', 'employment',
  '[
    {"step":1,"title":"Document wage discrepancy","description":"Calculate exact wages owed under CA Labor Code. CA minimum wage and overtime rules differ from federal."},
    {"step":2,"title":"File DLSE claim","description":"File at dir.ca.gov/dlse or in person at local DLSE office. Form DLSE-9 or online portal.","agency":"California DLSE","deadline":"3 years from violation"},
    {"step":3,"title":"Settlement conference","description":"DLSE schedules conference with employer. Most cases resolve here."},
    {"step":4,"title":"Hearing if unresolved","description":"Deputy Labor Commissioner holds hearing. Decision within 15 days."},
    {"step":5,"title":"Appeal if needed","description":"Either party may appeal to Superior Court within 45 days."}
  ]'::jsonb,
  '6-24 months', 0.60, 0),

('housing_eviction_defense_multi', 'Eviction Defense — Multi-State',
  'housing_violation', 'multi-state', 'housing',
  '[
    {"step":1,"title":"Review eviction notice","description":"Check notice type, timeline, and legal basis. Many evictions are defective on their face."},
    {"step":2,"title":"Contact legal aid immediately","description":"Same day as notice. Legal aid can file answer and assert defenses."},
    {"step":3,"title":"File written answer","description":"File answer asserting defenses: improper notice, retaliation, habitability, discrimination."},
    {"step":4,"title":"Attend hearing","description":"Appear at eviction hearing with evidence of defenses."},
    {"step":5,"title":"Negotiate resolution","description":"Payment plan, repair agreement, or dismissal."}
  ]'::jsonb,
  '2-8 weeks', 0.45, 0),

('insurance_appeal_multi', 'Insurance Denial Appeal — Multi-State',
  'insurance_denial', 'multi-state', 'insurance_denials',
  '[
    {"step":1,"title":"Request denial explanation","description":"Get written explanation of denial with specific policy provisions cited."},
    {"step":2,"title":"Internal appeal","description":"File internal appeal with insurer within 30-60 days. Include supporting documentation."},
    {"step":3,"title":"External review","description":"If internal appeal denied, request Independent Medical Review (IMR) or external review. Free under ACA."},
    {"step":4,"title":"State insurance commissioner complaint","description":"File complaint with state DOI. Creates regulatory pressure."},
    {"step":5,"title":"Legal action if needed","description":"Bad faith denial may support civil suit. Contact legal aid or attorney."}
  ]'::jsonb,
  '1-12 months', 0.50, 0),

('insurance_appeal_ca', 'California Insurance Denial Appeal — CDI + IMR',
  'insurance_denial', 'CA', 'insurance_denials',
  '[
    {"step":1,"title":"Get written denial with policy citation","description":"Must specify policy provision. California Insurance Code § 791 requires written explanation."},
    {"step":2,"title":"File internal appeal","description":"File within 30 days of denial. Request all supporting documentation."},
    {"step":3,"title":"IMR request (Independent Medical Review)","description":"File at dmhc.ca.gov within 180 days. Free. DMHC overturns ~30% of denials reviewed.","agency":"CA DMHC","deadline":"180 days from denial"},
    {"step":4,"title":"CDI complaint","description":"File complaint at insurance.ca.gov for insurance code violations.","agency":"California Department of Insurance"},
    {"step":5,"title":"Bad faith litigation","description":"CA has strong bad faith law. Punitive damages available for willful denials."}
  ]'::jsonb,
  '3-18 months', 0.55, 0),

('benefits_appeal_ssdi', 'SSDI Benefits Appeal — Federal SSA',
  'benefits_denial', 'federal', 'government_benefits',
  '[
    {"step":1,"title":"Request reconsideration","description":"File within 60 days of initial denial. ~15% success rate.","deadline":"60 days from denial"},
    {"step":2,"title":"Request ALJ hearing","description":"File within 60 days of reconsideration denial. Get legal representation NOW — success rate triples with attorney.","deadline":"60 days from reconsideration denial"},
    {"step":3,"title":"ALJ hearing","description":"Administrative Law Judge hearing. ~50% success rate with representation. Prepare medical evidence."},
    {"step":4,"title":"Appeals Council review","description":"If ALJ denies, request Appeals Council review within 60 days."},
    {"step":5,"title":"Federal court","description":"If Appeals Council denies, may appeal to U.S. District Court within 60 days."}
  ]'::jsonb,
  '1-3 years', 0.45, 0),

('benefits_appeal_ca_edd', 'California EDD Unemployment Appeal',
  'benefits_denial', 'CA', 'government_benefits',
  '[
    {"step":1,"title":"File appeal immediately","description":"File within 30 days of determination. Use UI Online, DE 1000 form, or call 1-800-300-5616.","agency":"California EDD","deadline":"30 days from determination"},
    {"step":2,"title":"Prepare for hearing","description":"Gather documentation: termination letter, communications, witnesses. Hearings are by phone or in person."},
    {"step":3,"title":"Attend ALJ hearing","description":"California Unemployment Insurance Appeals Board (CUIAB) hears case. ~60% reversal rate for appeals."},
    {"step":4,"title":"Board review","description":"If ALJ denies, request CUIAB Board review within 20 days."},
    {"step":5,"title":"Superior Court","description":"If Board denies, may petition Superior Court. File within 6 months."}
  ]'::jsonb,
  '2-6 months', 0.60, 0),

('employment_eeoc_federal', 'Employment Discrimination — EEOC Charge',
  'employment_discrimination', 'federal', 'civil_rights',
  '[
    {"step":1,"title":"File EEOC charge","description":"File charge within 180 days (or 300 days if state agency). Online at publicportal.eeoc.gov or call 1-800-669-4000.","agency":"EEOC","deadline":"300 days from discriminatory act"},
    {"step":2,"title":"EEOC investigation","description":"EEOC investigates, attempts mediation. Typically 10-18 months."},
    {"step":3,"title":"Right to sue notice","description":"If EEOC closes charge, request Right to Sue letter. Must file suit within 90 days of receipt."},
    {"step":4,"title":"State agency complaint","description":"Also file with state civil rights agency (dual filing preserves state claims)."},
    {"step":5,"title":"Civil litigation","description":"File Title VII suit in federal court within 90 days of Right to Sue."}
  ]'::jsonb,
  '1-5 years', 0.35, 0);

