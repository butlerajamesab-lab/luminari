begin;

create temporary table tmp_mi_fixture_objects (
  object_class text,
  object_key text,
  display_name text,
  jurisdiction text,
  parent_object_key text,
  payload jsonb,
  source_section text,
  source_heading text,
  source_page integer,
  source_text text,
  extraction_confidence numeric(4,3)
) on commit drop;

insert into tmp_mi_fixture_objects values
('state_metadata','mi_state_metadata','Michigan State Registry','MI',null,jsonb_build_object('state','Michigan','state_code','MI','fips','26','population','~10.0M','medicaid','Expanded (Healthy Michigan Plan)','minimum_wage','$10.56/hr (2025)','ui_max','$362/wk · 20 weeks','wage_sol','3 years (MWRCA)','civil_rights_sol','180 days (MDCR)'),'Header / State metadata','Michigan State Registry',1,'Michigan State Registry header: State Michigan (MI), FIPS 26, population ~10.0M, Medicaid Expanded Healthy Michigan Plan, minimum wage $10.56/hr, UI max $362/wk · 20 weeks, wage SOL 3 years, civil rights SOL 180 days.',0.995),
('layer0_policy_flags','MI-01','Michigan UI — 20-Week Maximum Duration, Shortest in Region','MI',null,jsonb_build_object('severity','CRITICAL','domain','unemployment_insurance','deadline','30 days from determination mailing','routing_note','Appeal every denial; MiDAS fraud notice requires legal review.'),'Layer 0 — Critical Policy Alerts','MI-01 · Michigan UI — 20-Week Maximum Duration, Shortest in Region (CRITICAL)',2,'Michigan unemployment insurance is capped at 20 weeks; UI appeal deadline is 30 days from determination mailing; MiDAS fraud overpayment notices require legal review.',0.995),
('layer0_policy_flags','MI-02','SNAP ABAWD Work Requirements — Active, Michigan No Statewide Waiver','MI',null,jsonb_build_object('severity','CRITICAL','domain','snap','trigger','ABAWD ages 18-54','requirement','80 hours/month','routing_note','Surface exemptions; Upper Peninsula counties may qualify for county-level geographic exemptions.'),'Layer 0 — Critical Policy Alerts','MI-02 · SNAP ABAWD Work Requirements — Active, Michigan No Statewide Waiver (CRITICAL)',2,'Michigan SNAP ABAWD work requirements are active statewide; ABAWDs ages 18–54 must document 80 hours/month; surface exemptions and check Upper Peninsula county status.',0.995),
('layer0_policy_flags','MI-03','Michigan TANF / FIP — $492/mo Max, 48-Month Lifetime Limit','MI',null,jsonb_build_object('severity','WARNING','domain','tanf','benefit_max','$492/month family of 3','lifetime_limit','48 months','routing_note','Pair with FAP, Medicaid, child care subsidy, LIHEAP, and emergency assistance.'),'Layer 0 — Critical Policy Alerts','MI-03 · Michigan TANF (Family Independence Program) — $492/mo Max, 48-Month Lifetime Limit (WARNING)',2,'Michigan TANF is Family Independence Program; maximum $492/month family of 3; 48-month lifetime limit; work requirement 20–30 hours/week.',0.995),
('layer0_policy_flags','MI-04','Detroit / Wayne County — Highest Urban Poverty in the Midwest','MI',null,jsonb_build_object('severity','WARNING','domain','jurisdiction_overlay','jurisdiction','Detroit / Wayne County','routing_note','Do not route Detroit residents to generic statewide resources without confirming Detroit/Wayne coverage; Arabic-language services important for Dearborn corridor.'),'Layer 0 — Critical Policy Alerts','MI-04 · Detroit / Wayne County — Highest Urban Poverty in the Midwest (WARNING)',2,'Detroit has approximately 30–35% poverty; Wayne County has different resource profile; Detroit-specific legal aid and housing resources are primary.',0.995),
('layer0_policy_flags','MI-05','Michigan 3-Year Wage SOL (MWRCA) — Strategic Advantage Over FLSA','MI',null,jsonb_build_object('severity','INFO','domain','wage_theft','state_sol','3 years','federal_comparison','FLSA 2 years','routing_note','File Michigan DOL and federal WHD simultaneously.'),'Layer 0 — Critical Policy Alerts','MI-05 · Michigan 3-Year Wage SOL (MWRCA) — Strategic Advantage Over FLSA (INFO)',2,'Michigan Workforce Recovery and Compensation Act has 3-year statute of limitations for wage claims, longer than federal FLSA 2-year SOL.',0.995),
('layer0_policy_flags','MI-06','Michigan Tribal Sovereignty — 12 Federally Recognized Tribes','MI',null,jsonb_build_object('severity','INFO','domain','tribal','tribes_count',12,'routing_note','Do not default to state social services for tribal members before checking tribal program availability; ICWA applies.'),'Layer 0 — Critical Policy Alerts','MI-06 · Michigan Tribal Sovereignty — 12 Federally Recognized Tribes, Major Land and Service Infrastructure (INFO)',3,'Michigan has 12 federally recognized tribes with TANF, housing, health care, child care and service delivery systems; ICWA applies for child welfare matters involving enrolled members.',0.995),
('layer0_policy_flags','MI-07','Michigan MiDAS Fraud System — False Fraud Findings Still Active','MI',null,jsonb_build_object('severity','CRITICAL','domain','unemployment_insurance','system','MiDAS','routing_note','Any UI fraud overpayment notice must be routed to Michigan Legal Help or Lakeshore Legal Aid before payment.'),'Layer 0 — Critical Policy Alerts','MI-07 · Michigan MiDAS Fraud System — False Fraud Findings Still Active (CRITICAL)',3,'Michigan MiDAS generated approximately 40,000 false fraud determinations; fraud flags, overpayment demands, or benefit bars may remain; route for legal review before payment.',0.995),
('layer0_policy_flags','MI-08','Michigan Elliott-Larsen Civil Rights Act — Broader Than Federal, LGBTQ+ Included','MI',null,jsonb_build_object('severity','INFO','domain','civil_rights','law','Elliott-Larsen Civil Rights Act','deadline','180 days MDCR','routing_note','Michigan ELCRA covers LGBTQ+ claims; stronger than Indiana state law for gender identity claims.'),'Layer 0 — Critical Policy Alerts','MI-08 · Michigan Elliott-Larsen Civil Rights Act — Broader Than Federal, LGBTQ+ Included (INFO)',3,'Michigan ELCRA was amended in 2023 to include sexual orientation and gender identity; MDCR 180-day SOL for employment and housing discrimination.',0.995);

with existing_run as (
  select extraction_run_id
  from public.luminari_fixture_extraction_runs
  where fixture_key = 'mi_state_registry_fixture'
    and run_label = 'mi_fixture_layer0_pass_1'
  limit 1
), inserted_run as (
  insert into public.luminari_fixture_extraction_runs (
    run_label,
    fixture_key,
    family_key,
    source_document_name,
    parser_version,
    run_status,
    started_at,
    completed_at,
    notes
  )
  select
    'mi_fixture_layer0_pass_1',
    'mi_state_registry_fixture',
    'general_state_registry',
    'luminari-michigan-registry-1(1).docx',
    'manual_grounded_seed_v1',
    'partial_loaded',
    now(),
    now(),
    'First grounded fixture load: Michigan state metadata and 8 Layer 0 policy flags only.'
  where not exists (select 1 from existing_run)
  returning extraction_run_id
), run_ref as (
  select extraction_run_id from inserted_run
  union all
  select extraction_run_id from existing_run
)
insert into public.luminari_fixture_extracted_objects (
  extraction_run_id,
  fixture_key,
  family_key,
  object_class,
  object_key,
  display_name,
  jurisdiction,
  parent_object_key,
  payload,
  source_section,
  source_heading,
  source_page,
  source_text,
  source_hash,
  extraction_confidence,
  validation_status,
  blockers
)
select
  rr.extraction_run_id,
  'mi_state_registry_fixture',
  'general_state_registry',
  fo.object_class,
  fo.object_key,
  fo.display_name,
  fo.jurisdiction,
  fo.parent_object_key,
  fo.payload,
  fo.source_section,
  fo.source_heading,
  fo.source_page,
  fo.source_text,
  md5(fo.source_text),
  fo.extraction_confidence,
  'pass',
  '{}'::text[]
from tmp_mi_fixture_objects fo
cross join run_ref rr
where not exists (
  select 1
  from public.luminari_fixture_extracted_objects existing
  where existing.fixture_key = 'mi_state_registry_fixture'
    and existing.object_class = fo.object_class
    and existing.object_key = fo.object_key
);

with run_ref as (
  select extraction_run_id
  from public.luminari_fixture_extraction_runs
  where fixture_key = 'mi_state_registry_fixture'
    and run_label = 'mi_fixture_layer0_pass_1'
  limit 1
)
insert into public.luminari_fixture_extracted_objects (
  extraction_run_id,
  fixture_key,
  family_key,
  object_class,
  object_key,
  display_name,
  jurisdiction,
  parent_object_key,
  payload,
  source_section,
  source_heading,
  source_page,
  source_text,
  source_hash,
  extraction_confidence,
  validation_status,
  blockers
)
select
  rr.extraction_run_id,
  'mi_state_registry_fixture',
  'general_state_registry',
  'provenance_spans',
  'prov_' || fo.object_key,
  'Provenance span for ' || fo.object_key,
  fo.jurisdiction,
  fo.object_key,
  jsonb_build_object('object_class', fo.object_class, 'object_key', fo.object_key, 'source_heading', fo.source_heading),
  fo.source_section,
  fo.source_heading,
  fo.source_page,
  fo.source_text,
  md5(fo.source_text),
  fo.extraction_confidence,
  'pass',
  '{}'::text[]
from tmp_mi_fixture_objects fo
cross join run_ref rr
where not exists (
  select 1
  from public.luminari_fixture_extracted_objects existing
  where existing.fixture_key = 'mi_state_registry_fixture'
    and existing.object_class = 'provenance_spans'
    and existing.object_key = 'prov_' || fo.object_key
);

commit;
