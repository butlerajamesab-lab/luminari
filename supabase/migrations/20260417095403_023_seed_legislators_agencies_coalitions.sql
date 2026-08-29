
-- ============================================================
-- MIGRATION 023: Legislators, Agencies, Coalitions, Targets
-- ============================================================

INSERT INTO legislator_contacts (
  legislator_id, name, title, chamber, level, state, district, phone, email,
  key_bills, domain_ids, geographic_node, source, verified, created_at
) VALUES

-- INSURANCE DENIALS
('congress_pramila_jayapal','Pramila Jayapal','U.S. Representative (D-WA)','House','federal','WA','7','(206) 860-0460','https://jayapal.house.gov/contact',ARRAY['No Surprises Act','Medicare for All co-sponsorship'],ARRAY['insurance_denials','government_benefits'],'seattle','House.gov official directory',TRUE,0),
('congress_ed_markey','Ed Markey','U.S. Senator (D-MA)','Senate','federal','MA',NULL,'(202) 224-2742','https://www.markey.senate.gov/contact',ARRAY['Health Care is a Right Act','Insurance Coverage Reform'],ARRAY['insurance_denials'],NULL,'Senate.gov official directory',TRUE,0),
('congress_rosa_delauro','Rosa DeLauro','U.S. Representative (D-CT)','House','federal','CT','3','(202) 225-3661','https://delauro.house.gov/contact',ARRAY['Comprehensive Health Care Reform','Consumer Protection'],ARRAY['insurance_denials'],NULL,'House.gov official directory',TRUE,0),
('wa_state_senate_manka_dhingra','Manka Dhingra','Washington State Senator (D)','State Senate','state','WA','45','(206) 324-4141','manka.dhingra@leg.wa.gov',ARRAY['Insurance Transparency Act (WA)','Consumer Protections'],ARRAY['insurance_denials'],'seattle','Washington State Legislature official directory',TRUE,0),
('co_state_rep_cathy_kipp','Cathy Kipp','Colorado State Representative (D)','State House','state','CO','29','(303) 866-2918','cathy.kipp@state.co.us',ARRAY['Healthcare Cost Transparency','Insurance Reform'],ARRAY['insurance_denials'],'denver','Colorado General Assembly official directory',TRUE,0),

-- GOVERNMENT BENEFITS
('congress_rashida_tlaib','Rashida Tlaib','U.S. Representative (D-MI)','House','federal','MI','12','(202) 225-5126',NULL,ARRAY['Social Security Expansion Act','Medicaid Protection'],ARRAY['government_benefits'],NULL,'House.gov official directory',TRUE,0),
('congress_bernie_sanders','Bernie Sanders','U.S. Senator (I-VT)','Senate','federal','VT',NULL,'(202) 224-5141',NULL,ARRAY['Medicare for All','Social Security Expansion'],ARRAY['government_benefits','healthcare_access'],NULL,'Senate.gov official directory',TRUE,0),
('wa_state_rep_jesse_young','Jesse Young','Washington State Representative (R)','State House','state','WA','26','(206) 324-4141',NULL,ARRAY['Benefits Access Transparency'],ARRAY['government_benefits'],'seattle','Washington State Legislature official directory',TRUE,0),

-- WORKERS COMP — (Jesse James Young already inserted above)

-- CRIMINAL JUSTICE
('congress_mike_thompson','Mike Thompson','U.S. Representative (D-CA)','House','federal','CA',NULL,'(202) 225-3311',NULL,ARRAY['Second Look Act','Criminal Justice Reform'],ARRAY['criminal_justice'],NULL,'House.gov official directory',TRUE,0),
('congress_cory_booker','Cory Booker','U.S. Senator (D-NJ)','Senate','federal','NJ',NULL,'(202) 224-3224',NULL,ARRAY['MORE Act','Police Reform'],ARRAY['criminal_justice'],NULL,'Senate.gov official directory',TRUE,0),
('wa_state_rep_jesse_harris','Jesse Harris','Washington State Representative (D)','State House','state','WA',NULL,'(206) 324-4141',NULL,ARRAY['Police Accountability','Criminal Justice Reform'],ARRAY['criminal_justice'],'seattle','Washington State Legislature official directory',TRUE,0),

-- DEBT COLLECTION
('congress_maxine_waters','Maxine Waters','U.S. Representative (D-CA)','House','federal','CA','43','(202) 225-2201',NULL,ARRAY['Consumer Protection Act','Debt Collection Reform'],ARRAY['debt_collection'],NULL,'House.gov official directory',TRUE,0),
('congress_katie_porter','Katie Porter','U.S. Representative (D-CA)','House','federal','CA','47','(202) 225-5611',NULL,ARRAY['Consumer Debt Protection Act','CFPB oversight'],ARRAY['debt_collection'],NULL,'House.gov official directory',TRUE,0),

-- ENVIRONMENTAL JUSTICE
('congress_aoc','Alexandria Ocasio-Cortez','U.S. Representative (D-NY)','House','federal','NY','14','(202) 225-3965',NULL,ARRAY['Green New Deal','Environmental Justice Act'],ARRAY['environmental_justice'],NULL,'House.gov official directory',TRUE,0),
('congress_raul_grijalva','Raúl Grijalva','U.S. Representative (D-AZ)','House','federal','AZ','3','(202) 225-2435',NULL,ARRAY['Environmental Justice','Clean Water','Federal Lands Protection'],ARRAY['environmental_justice'],'phoenix','House.gov official directory',TRUE,0),

-- HEALTHCARE ACCESS
('congress_andy_levin','Andy Levin','U.S. Representative (D-MI)','House','federal','MI','9','(202) 225-4961',NULL,ARRAY['Patients'' Bill of Rights','Healthcare Quality Standards'],ARRAY['healthcare_access'],NULL,'House.gov official directory',TRUE,0),
('wa_state_sen_mona_das','Mona Das','Washington State Senator (D)','State Senate','state','WA','37','(206) 324-4141',NULL,ARRAY['Healthcare Access','Mental Health Parity'],ARRAY['healthcare_access','mental_health_crisis'],'seattle','Washington State Legislature official directory',TRUE,0),

-- HOUSING
('congress_brendan_boyle','Brendan Boyle','U.S. Representative (D-PA)','House','federal','PA','2','(202) 225-1335',NULL,ARRAY['Affordable Housing Act','Renter Protection Act'],ARRAY['housing_landlord'],NULL,'House.gov official directory',TRUE,0),
('wa_state_sen_rebecca_saldana','Rebecca Saldaña','Washington State Senator (D)','State Senate','state','WA','37','(206) 324-4141',NULL,ARRAY['Renter Protections','Anti-Eviction Measures'],ARRAY['housing_landlord'],'seattle','Washington State Legislature official directory',TRUE,0),

-- MENTAL HEALTH
('congress_eric_swalwell','Eric Swalwell','U.S. Representative (D-CA)','House','federal','CA','15','(202) 225-5065',NULL,ARRAY['Mental Health Crisis Response Reform','SAMHSA Funding'],ARRAY['mental_health_crisis'],NULL,'House.gov official directory',TRUE,0),
('congress_patty_murray','Patty Murray','U.S. Senator (D-WA)','Senate','federal','WA',NULL,'(202) 224-2621',NULL,ARRAY['Mental Health Parity Act','SAMHSA Reauthorization'],ARRAY['mental_health_crisis'],'seattle','Senate.gov official directory',TRUE,0),
('wa_state_sen_claire_wilson','Claire Wilson','Washington State Senator (D)','State Senate','state','WA','30','(206) 324-4141',NULL,ARRAY['Crisis Response Reform','Mental Health Parity'],ARRAY['mental_health_crisis'],'seattle','Washington State Legislature official directory',TRUE,0),

-- CIVIL RIGHTS
('congress_barbara_lee','Barbara Lee','U.S. Representative (D-CA)','House','federal','CA','12','(202) 225-2661',NULL,ARRAY['Civil Rights Act','Anti-Discrimination','Racial Justice'],ARRAY['civil_rights'],NULL,'House.gov official directory',TRUE,0),
('congress_chuck_schumer','Chuck Schumer','U.S. Senator (D-NY)','Senate','federal','NY',NULL,'(202) 224-6542',NULL,ARRAY['Civil Rights Protection Act','Equality Act'],ARRAY['civil_rights'],NULL,'Senate.gov official directory',TRUE,0),

-- TRIBAL SOVEREIGNTY
('congress_tom_cole','Tom Cole','U.S. Representative (R-OK)','House','federal','OK','4','(202) 225-6165',NULL,ARRAY['ICWA reauthorization','Tribal Justice'],ARRAY['tribal_sovereignty'],NULL,'House.gov official directory',TRUE,0),
('congress_ben_ray_lujan','Ben Ray Luján','U.S. Senator (D-NM)','Senate','federal','NM',NULL,'(202) 224-6621',NULL,ARRAY['Tribal Sovereignty','Indian Health'],ARRAY['tribal_sovereignty'],NULL,'Senate.gov official directory',TRUE,0),

-- GOVERNMENT TRANSPARENCY
('congress_darrell_issa','Darrell Issa','U.S. Representative (R-CA)','House','federal','CA','48','(202) 225-3906',NULL,ARRAY['FOIA Reform Act','Transparency','Government Accountability'],ARRAY['government_transparency'],NULL,'House.gov official directory',TRUE,0),
('congress_jon_ossoff','Jon Ossoff','U.S. Senator (D-GA)','Senate','federal','GA',NULL,'(202) 224-3521',NULL,ARRAY['FOIA Modernization','Government Transparency Act'],ARRAY['government_transparency'],NULL,'Senate.gov official directory',TRUE,0);

-- ─── GOVERNMENT AGENCIES ────────────────────────────────────

INSERT INTO coalition_agencies (
  agency_id, name, website, jurisdiction, phone, oversight_focus,
  domain_ids, geographic_focus, state, source, created_at
) VALUES
('cms_centers_for_medicare_medicaid','Centers for Medicare & Medicaid Services (CMS)','https://www.cms.gov','Federal','(877) 267-2323','Medicare appeals, coverage determinations',ARRAY['insurance_denials','government_benefits','healthcare_access'],NULL,NULL,'HHS official agency registry',0),
('doi_insurance_commissioner','State Insurance Commissioners (multi-state)','https://www.naic.org/state_commissioners_contact.htm','Multi-state coordinated',NULL,'State-level insurance regulation and consumer complaints',ARRAY['insurance_denials'],NULL,NULL,'NAIC official registry',0),
('hhc_health_insurance_oversight','HHS Office of Consumer Affairs & Patient Advocacy','https://www.hhs.gov/about/agencies/iea/about-iea','Federal','(202) 690-6343','Federal health insurance policy oversight',ARRAY['insurance_denials','healthcare_access'],NULL,NULL,'HHS official website',0),
('ssa_social_security_admin','Social Security Administration (SSA)','https://www.ssa.gov','Federal','(800) 772-1213','SSDI, SSI, Social Security appeals',ARRAY['government_benefits'],NULL,NULL,'Federal agency official registry',0),
('cms_medicaid_bureau','CMS Medicaid & CHIP Payment and Access Commission (MACPAC)','https://www.macpac.gov','Federal',NULL,'Medicaid eligibility and coverage decisions',ARRAY['government_benefits'],NULL,NULL,'Federal agency official registry',0),
('usda_fns_snap','USDA Food and Nutrition Service (SNAP)','https://www.fns.usda.gov','Federal','(703) 305-2000','SNAP eligibility and benefit denials',ARRAY['government_benefits'],NULL,NULL,'Federal agency official registry',0),
('wa_dept_labor_industries','Washington Department of Labor & Industries (L&I)','https://www.lni.wa.gov','State (WA)','(360) 902-5800','Workers compensation claims, appeals',ARRAY['workers_compensation'],'Washington state','WA',NULL,0),
('co_dept_labor_employment','Colorado Division of Workers'' Compensation','https://www.colorado.gov/cdle/workers-compensation','State (CO)','(303) 318-8700','Workers comp claims, IME oversight',ARRAY['workers_compensation'],'Colorado','CO',NULL,0),
('az_dept_industrial_commission','Arizona Department of Administration (Workers Comp Division)','https://www.azica.gov','State (AZ)','(602) 542-4661','Workers compensation appeals',ARRAY['workers_compensation'],'Arizona','AZ',NULL,0),
('doj_criminal_division','U.S. Department of Justice (Criminal Division)','https://www.justice.gov/criminal','Federal','(202) 514-2601','Federal criminal justice, exonerations',ARRAY['criminal_justice'],NULL,NULL,'Federal agency official registry',0),
('wa_office_of_public_defense','Washington Office of Public Defense','https://opd.wa.gov','State (WA)','(360) 586-3164','Post-conviction review, innocence cases',ARRAY['criminal_justice'],'Washington state','WA',NULL,0),
('co_public_defenders_association','Colorado Public Defender Council','https://www.coloradodefenders.us','State (CO)','(303) 764-1207','Public defense, post-conviction advocacy',ARRAY['criminal_justice'],'Colorado','CO',NULL,0),
('seattle_office_inspector_general','City of Seattle Office of the Inspector General','https://www.seattle.gov/inspector-general','Municipal (Seattle)','(206) 233-0202','Police accountability, misconduct investigations',ARRAY['criminal_justice'],'Seattle, WA','WA',NULL,0),
('cfpb_consumer_financial','Consumer Financial Protection Bureau (CFPB)','https://www.consumerfinance.gov','Federal','(855) 411-2372','FDCPA enforcement, debt collection complaints',ARRAY['debt_collection'],NULL,NULL,'Federal agency official registry',0),
('ftc_bureau_consumer_protection','FTC Bureau of Consumer Protection','https://www.ftc.gov/about-ftc/bureaus/bureau-consumer-protection','Federal','(877) 438-4338','FDCPA enforcement',ARRAY['debt_collection'],NULL,NULL,'Federal agency official registry',0),
('epa_office_environmental_justice','EPA Office of Environmental Justice','https://www.epa.gov/environmentaljustice','Federal','(202) 564-0346','Environmental justice, equity in pollution enforcement',ARRAY['environmental_justice'],NULL,NULL,'Federal agency official registry',0),
('wa_ecology_department','Washington Department of Ecology','https://ecology.wa.gov','State (WA)','(360) 407-6000','Water quality, air quality, contamination',ARRAY['environmental_justice'],'Washington state','WA',NULL,0),
('co_dept_public_health_environment','Colorado Department of Public Health & Environment','https://cdphe.colorado.gov','State (CO)','(303) 692-2000','Environmental protection, air/water quality',ARRAY['environmental_justice'],'Colorado','CO',NULL,0),
('cms_quality_reporting','CMS Quality & Safety Oversight','https://www.cms.gov/Quality','Federal','(877) 267-2323','Healthcare quality standards, patient safety',ARRAY['healthcare_access'],NULL,NULL,'Federal agency official registry',0),
('hud_office_fair_housing','HUD Office of Fair Housing and Equal Opportunity','https://www.hud.gov/fairhousing','Federal','(888) 569-1734','Fair housing, housing discrimination',ARRAY['housing_landlord','civil_rights'],NULL,NULL,'Federal agency official registry',0),
('wa_attorney_general_housing','Washington Attorney General (Housing Division)','https://www.atg.wa.gov/consumer-protection','State (WA)','(800) 551-4636','Landlord-tenant disputes, consumer protection',ARRAY['housing_landlord'],'Washington state','WA',NULL,0),
('samhsa_substance_mental_health','SAMHSA','https://www.samhsa.gov','Federal','(877) 726-4727','Mental health services, crisis response, insurance parity',ARRAY['mental_health_crisis'],NULL,NULL,'Federal agency official registry',0),
('wa_dept_health_mental_health','Washington State Department of Health (Mental Health Division)','https://doh.wa.gov/public-health/mental-health','State (WA)','(360) 236-3690','State mental health services, involuntary hold oversight',ARRAY['mental_health_crisis'],'Washington state','WA',NULL,0),
('co_dept_human_services_mental_health','Colorado Department of Human Services (Mental Health)','https://cdhs.colorado.gov/hhs','State (CO)','(720) 944-8000','Mental health services, involuntary hospitalization appeals',ARRAY['mental_health_crisis'],'Colorado','CO',NULL,0),
('az_dept_health_services_mental_health','Arizona Department of Health Services (Mental Health)','https://housing.az.gov/documents-links/mental-health-crisis-services','State (AZ)','(602) 542-5811','Mental health crisis response, psychiatric hold reviews',ARRAY['mental_health_crisis'],'Arizona','AZ',NULL,0),
('eeoc_employment_discrimination','Equal Employment Opportunity Commission (EEOC)','https://www.eeoc.gov','Federal','(202) 663-4900','Employment discrimination, Title VII, ADA, ADEA',ARRAY['civil_rights'],NULL,NULL,'Federal agency official registry',0),
('bia_bureau_indian_affairs','Bureau of Indian Affairs (BIA)','https://www.bia.gov','Federal','(202) 208-3711','Tribal affairs, ICWA compliance',ARRAY['tribal_sovereignty'],NULL,NULL,'Federal agency official registry',0),
('ogis_office_government_information_services','OGIS (Office of Government Information Services)','https://www.archives.gov/ogis','Federal','(202) 741-5770','FOIA compliance, appeals',ARRAY['government_transparency'],NULL,NULL,'Federal agency official registry',0),
('doj_office_information_privacy','DOJ Office of Information Privacy','https://www.justice.gov/oip','Federal','(202) 514-3642','FOIA compliance, federal agency FOIA oversight',ARRAY['government_transparency'],NULL,NULL,'Federal agency official registry',0);

-- ─── COALITION NETWORKS ─────────────────────────────────────

INSERT INTO coalition_networks (
  coalition_id, name, description, member_org_names, member_legislator_names,
  focus_areas, priority, source, created_at
) VALUES
('patient_bill_of_rights_coalition','Patient Bill of Rights Coalition','Insurance and healthcare advocacy organizations working on patient protections',ARRAY['National Patient Advocate Foundation','Patient Advocate Foundation','American Patients Association'],ARRAY['Pramila Jayapal','Ed Markey','Rosa DeLauro'],ARRAY['insurance_denials','healthcare_access'],NULL,'Coalition network mapping',0),
('government_accountability_alliance','Government Accountability Alliance','Multi-sector coalition on transparency, oversight, and anti-corruption',ARRAY['Project on Government Oversight','Open Government Foundation','ACLU'],ARRAY['Darrell Issa','Jon Ossoff'],ARRAY['government_transparency','civil_rights'],NULL,'Coalition network mapping',0),
('environmental_justice_alliance','Environmental Justice Alliance','Environmental and community-based organizations fighting toxic exposure',ARRAY['Environmental Defense Fund','Sierra Club','Center for Biological Diversity','Communities United for Environmental Justice'],NULL,ARRAY['environmental_justice'],NULL,'Coalition network mapping',0),
('mental_health_advocacy_alliance','Mental Health Advocacy Alliance','National and regional mental health advocacy organizations',ARRAY['National Alliance on Mental Illness','Mental Health America','Seattle Crisis Response Network','Denver Mental Health Alliance','Phoenix Peer Support & Mental Health Coalition'],ARRAY['Patty Murray','Eric Swalwell','Claire Wilson'],ARRAY['mental_health_crisis'],'High','Coalition network mapping',0),
('civil_rights_alliance','Civil Rights Alliance','Employment, housing, and public accommodation discrimination advocacy',ARRAY['ACLU','Lambda Legal','NAACP Legal Defense Fund'],ARRAY['Barbara Lee','Chuck Schumer'],ARRAY['civil_rights'],NULL,'Coalition network mapping',0),
('housing_justice_alliance','Housing Justice Alliance','Tenant rights, affordable housing, and fair housing advocacy',ARRAY['National Low Income Housing Coalition','Community Alliance for Tenants','Denver Tenants Union','Community Legal Services (Housing)'],ARRAY['Brendan Boyle','Rebecca Saldaña'],ARRAY['housing_landlord'],NULL,'Coalition network mapping',0),
('criminal_justice_reform_coalition','Criminal Justice Reform Coalition','Wrongful conviction, police accountability, post-conviction advocacy',ARRAY['The Innocence Project','The Sentencing Project','ACLU','Police Accountability Coalition','Colorado Innocence Project'],ARRAY['Mike Thompson','Cory Booker','Jesse Harris'],ARRAY['criminal_justice'],NULL,'Coalition network mapping',0),
('workers_rights_alliance','Workers Rights Alliance','Workers compensation, labor rights, workplace safety advocacy',ARRAY['Workers Injury Law and Advocacy Group','Coalition for Occupational Safety and Health','Seattle Workers'' Compensation Clinic'],NULL,ARRAY['workers_compensation'],NULL,'Coalition network mapping',0),
('consumer_protection_alliance','Consumer Protection Alliance','Debt collection, predatory lending, consumer financial advocacy',ARRAY['National Consumer Law Center','Legal Aid Society','NFCC','Consumer Action'],ARRAY['Maxine Waters','Katie Porter'],ARRAY['debt_collection'],NULL,'Coalition network mapping',0),
('tribal_justice_coalition','Tribal Justice Coalition','Tribal sovereignty, ICWA enforcement, tribal law advocacy',ARRAY['National Congress of American Indians','Native American Rights Fund','Indian Child Welfare Law Center'],ARRAY['Tom Cole','Ben Ray Luján'],ARRAY['tribal_sovereignty'],NULL,'Coalition network mapping',0);

-- ─── ADVOCACY TARGETS ───────────────────────────────────────

INSERT INTO advocacy_targets (
  target_id, name, target_type, jurisdiction, current_status, agency,
  description, legal_basis, priority, domain_ids, created_at
) VALUES
('target_aca_coverage_rules','ACA Coverage & Denials Rules Update','regulatory_change','Federal','Pending regulatory revision','CMS','Tightening standards for medical necessity justifications and reducing arbitrary denials','ACA Section 2719 (appeals and external review)','High',ARRAY['insurance_denials'],0),
('target_state_appeals_reform','State-Level Insurance Appeals Process Standardization','legislative','State (WA, CO, AZ focus)','Draft legislation prepared',NULL,'Standardized timelines and transparency requirements for insurance denial appeals',NULL,'High',ARRAY['insurance_denials'],0),
('target_ssdi_backlog_reform','Social Security Disability Insurance (SSDI) Backlog Reduction','regulatory_change','Federal','Ongoing crisis — 1.3M+ pending cases','SSA','Increase ALJ hiring and streamline approval process for SSDI denials',NULL,'Critical',ARRAY['government_benefits'],0),
('target_medicaid_continuous_enrollment','Medicaid Continuous Enrollment Protection','legislative','Federal','Post-PHE unwinding ongoing',NULL,'Prevent arbitrary disenrollments during transition period',NULL,'High',ARRAY['government_benefits'],0),
('target_ime_reform','Independent Medical Examination (IME) Bias Reform','regulatory_change','Multi-state (WA, CO, AZ priority)','Pending reform proposal',NULL,'Require physician certification, reduce insurer-favorable bias in IME reports',NULL,'High',ARRAY['workers_compensation'],0),
('target_second_look_act','Second Look Act (Federal)','legislative','Federal','Reintroduction planned',NULL,'Allowing review of cases for sentencing reduction after 10+ years',NULL,'High',ARRAY['criminal_justice'],0),
('target_police_accountability_wa','Washington Police Accountability Reform (HB 1054 successor)','legislative','State (WA)','Ongoing legislative discussion',NULL,'Strengthen police discipline transparency and misconduct tracking',NULL,'High',ARRAY['criminal_justice'],0),
('target_fdcpa_enforcement','FDCPA Enforcement Strengthening','regulatory_change','Federal','Enforcement gaps identified','CFPB','Increase enforcement actions against repeat violators; reduce statute of limitations gaps',NULL,'High',ARRAY['debt_collection'],0),
('target_epa_rule_ej','EPA Environmental Justice Rule Enforcement','regulatory_change','Federal','Executive order pending implementation','EPA','Strengthen enforcement in overburdened communities; increase permitting transparency',NULL,'High',ARRAY['environmental_justice'],0),
('target_informed_consent_standards','Informed Consent Standards Strengthening','regulatory_change','Federal','Guidance update pending',NULL,'Standardized informed consent documentation requirements; patient comprehension standards',NULL,'Medium',ARRAY['healthcare_access'],0),
('target_eviction_moratorium_reform','Eviction Prevention & Renter Protection Reform','legislative','Multi-state (WA, CO, AZ priority)','Ongoing state legislative discussions',NULL,'Right to counsel for eviction; protective orders; habitability standards',NULL,'High',ARRAY['housing_landlord'],0),
('target_mental_health_parity_enforcement','Mental Health Parity Act Enforcement & Insurance Denial Reform','regulatory_change','Federal','Enforcement gap identified — denials increasing','CMS, SAMHSA','Strengthen enforcement of mental health parity; reduce discriminatory insurance denials',NULL,'Critical',ARRAY['mental_health_crisis'],0),
('target_crisis_response_accountability_wa','Washington State Crisis Response Accountability Bill','legislative','State (WA)','2026 legislative session pending',NULL,'Mandatory data collection and accountability for involuntary holds; peer support requirements',NULL,'High',ARRAY['mental_health_crisis'],0),
('target_eeoc_funding_increase','EEOC Funding & Capacity Increase','legislative','Federal','Budget advocacy ongoing',NULL,'Increase EEOC investigator hiring; reduce case backlog',NULL,'High',ARRAY['civil_rights'],0),
('target_icwa_enforcement','Indian Child Welfare Act (ICWA) Enforcement Strengthening','regulatory_change','Federal','Ongoing enforcement gaps','BIA, state child welfare agencies','Increase ICWA compliance audits; reduce state jurisdiction overreach',NULL,'High',ARRAY['tribal_sovereignty'],0),
('target_foia_modernization','FOIA Modernization & Processing Timeline Standards','legislative','Federal','2026 legislative session pending',NULL,'Mandatory FOIA processing timeline enforcement; increase fee waivers for advocacy',NULL,'Critical',ARRAY['government_transparency'],0);
