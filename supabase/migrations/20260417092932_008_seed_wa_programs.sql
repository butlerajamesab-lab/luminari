
-- ============================================================
-- LUMINARI — MIGRATION 008
-- Seed: Washington State Programs — Real, Verified, Actionable
-- Layer 1 Immediate Help — fires at intake for every person
-- National programs included (is_national = TRUE)
-- ============================================================

INSERT INTO programs (
  program_key, name, resource_type, provider_type,
  state_code, is_national, situation_tags, population_tags,
  income_threshold, turnaround, is_emergency,
  phone, application_url, website,
  eligibility, cost, languages,
  source_url, last_verified, created_at, updated_at
) VALUES

-- ─── NATIONAL CRISIS / MENTAL HEALTH ───────────────────────────────

('national-988-lifeline', '988 Suicide & Crisis Lifeline',
  'mental_health', 'nonprofit', NULL, TRUE,
  ARRAY['mental_health','crisis','dv','any'],
  ARRAY['all'],
  FALSE, 'same_day', TRUE,
  '988', NULL, 'https://988lifeline.org',
  'Open to all. Call or text 988 anytime.',
  'Free', ARRAY['English','Spanish','200+ languages'],
  'https://988lifeline.org', '2026-04', 0, 0),

('national-crisis-text-line', 'Crisis Text Line',
  'mental_health', 'nonprofit', NULL, TRUE,
  ARRAY['mental_health','crisis','any'],
  ARRAY['all'],
  FALSE, 'same_day', TRUE,
  NULL, NULL, 'https://www.crisistextline.org',
  'Text HOME to 741741. Open to all.',
  'Free', ARRAY['English','Spanish'],
  'https://www.crisistextline.org', '2026-04', 0, 0),

('national-samhsa', 'SAMHSA National Helpline',
  'substance_use', 'federal', NULL, TRUE,
  ARRAY['mental_health','substance_use','any'],
  ARRAY['all'],
  FALSE, 'same_day', TRUE,
  '1-800-662-4357', NULL, 'https://www.samhsa.gov/find-help/national-helpline',
  'Free, confidential, 24/7 treatment referral.',
  'Free', ARRAY['English','Spanish'],
  'https://www.samhsa.gov', '2026-04', 0, 0),

('national-ndvh', 'National Domestic Violence Hotline',
  'dv_services', 'nonprofit', NULL, TRUE,
  ARRAY['dv','housing','mental_health','any'],
  ARRAY['dv_survivors','all'],
  FALSE, 'same_day', TRUE,
  '1-800-799-7233', NULL, 'https://www.thehotline.org',
  'Open to all survivors of domestic violence.',
  'Free', ARRAY['English','Spanish','200+ languages'],
  'https://www.thehotline.org', '2026-04', 0, 0),

('national-veterans-crisis', 'Veterans Crisis Line',
  'mental_health', 'va', NULL, TRUE,
  ARRAY['mental_health','crisis','any'],
  ARRAY['veterans'],
  FALSE, 'same_day', TRUE,
  '988 then press 1', NULL, 'https://www.veteranscrisisline.net',
  'Veterans, service members, and their families.',
  'Free', ARRAY['English','Spanish'],
  'https://www.veteranscrisisline.net', '2026-04', 0, 0),

-- ─── NATIONAL FOOD / BENEFITS ──────────────────────────────────────

('national-snap-benefits', 'SNAP (Food Stamps) — Federal Program',
  'food', 'federal', NULL, TRUE,
  ARRAY['food','benefits','any'],
  ARRAY['low_income','families','all'],
  TRUE, '1_week', FALSE,
  '1-800-221-5689', 'https://www.fns.usda.gov/snap/recipient/how-apply',
  'https://www.fns.usda.gov/snap',
  'Income-based. Apply through your state agency.',
  'Free', ARRAY['English','Spanish'],
  'https://www.fns.usda.gov/snap', '2026-04', 0, 0),

('national-wic', 'WIC — Women, Infants & Children',
  'food', 'federal', NULL, TRUE,
  ARRAY['food','healthcare','benefits'],
  ARRAY['pregnant','infants','children','low_income'],
  TRUE, '1_week', FALSE,
  '1-800-942-3678', NULL, 'https://www.fns.usda.gov/wic',
  'Pregnant women, new mothers, infants under 1, children under 5. Income-based.',
  'Free', ARRAY['English','Spanish'],
  'https://www.fns.usda.gov/wic', '2026-04', 0, 0),

-- ─── NATIONAL LEGAL AID ────────────────────────────────────────────

('national-lawhelp', 'LawHelp.org — Legal Aid Finder',
  'legal_aid', 'nonprofit', NULL, TRUE,
  ARRAY['any'],
  ARRAY['low_income','all'],
  TRUE, '1_week', FALSE,
  NULL, 'https://www.lawhelp.org', 'https://www.lawhelp.org',
  'Find free legal aid in your state.',
  'Free', ARRAY['English','Spanish'],
  'https://www.lawhelp.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — FOOD ───────────────────────────────────────

('wa-snap', 'Washington SNAP / Basic Food',
  'food', 'state', 'WA', FALSE,
  ARRAY['food','benefits','eviction','any'],
  ARRAY['low_income','families','all'],
  TRUE, '1_week', FALSE,
  '1-877-501-2233', 'https://www.washingtonconnection.org',
  'https://www.dshs.wa.gov/esa/community-services-offices/basic-food',
  'WA residents meeting income guidelines. Apply online at WashingtonConnection.org.',
  'Free', ARRAY['English','Spanish','Vietnamese','Somali','Russian'],
  'https://www.dshs.wa.gov', '2026-04', 0, 0),

('wa-food-banks', 'Washington Food Banks — Food Lifeline Network',
  'food', 'nonprofit', 'WA', FALSE,
  ARRAY['food','any'],
  ARRAY['all'],
  FALSE, 'same_day', TRUE,
  NULL, 'https://foodlifeline.org/get-help', 'https://foodlifeline.org',
  'No eligibility requirements. Find your nearest food bank.',
  'Free', ARRAY['English','Spanish'],
  'https://foodlifeline.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — RENTAL ASSISTANCE ─────────────────────────

('wa-erap', 'Washington Emergency Rental Assistance Program',
  'rental_assistance', 'state', 'WA', FALSE,
  ARRAY['eviction','housing','rental_assistance','any'],
  ARRAY['low_income','all'],
  TRUE, '48_hours', TRUE,
  NULL, 'https://www.commerce.wa.gov/serving-communities-sheltering-homelessness/rental-assistance',
  'https://www.commerce.wa.gov',
  'WA residents facing eviction or unable to pay rent. Income-based.',
  'Free', ARRAY['English','Spanish'],
  'https://www.commerce.wa.gov', '2026-04', 0, 0),

('wa-liheap', 'LIHEAP — Home Energy Assistance (WA)',
  'utility_assistance', 'federal', 'WA', FALSE,
  ARRAY['utility_assistance','benefits','any'],
  ARRAY['low_income','seniors','families'],
  TRUE, '1_week', FALSE,
  '1-800-201-0300', 'https://www.commerce.wa.gov/serving-communities-sheltering-homelessness/energy',
  'https://www.commerce.wa.gov',
  'WA residents struggling with heating/cooling bills. Income-based.',
  'Free', ARRAY['English','Spanish'],
  'https://www.commerce.wa.gov', '2026-04', 0, 0),

('wa-puget-sound-energy-assist', 'Puget Sound Energy HELP Program',
  'utility_assistance', 'other', 'WA', FALSE,
  ARRAY['utility_assistance','any'],
  ARRAY['low_income','all'],
  TRUE, '1_week', FALSE,
  '1-888-225-5773', 'https://pse.com/en/accountsandservices/financial-assistance',
  'https://pse.com',
  'PSE customers facing utility shutoff. Income-based.',
  'Free', ARRAY['English','Spanish'],
  'https://pse.com', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — HOUSING / SHELTER ─────────────────────────

('wa-2-1-1', '211 Washington — Crisis & Resource Helpline',
  'benefits_navigation', 'nonprofit', 'WA', FALSE,
  ARRAY['any'],
  ARRAY['all'],
  FALSE, 'same_day', TRUE,
  '211', 'https://wa211.org', 'https://wa211.org',
  'Anyone in Washington. Connects to local resources for any need.',
  'Free', ARRAY['English','Spanish','150+ languages'],
  'https://wa211.org', '2026-04', 0, 0),

('wa-catholic-charities-housing', 'Catholic Charities Housing Services (WA)',
  'housing', 'nonprofit', 'WA', FALSE,
  ARRAY['eviction','housing','rental_assistance','any'],
  ARRAY['low_income','families','all'],
  TRUE, '48_hours', TRUE,
  '1-800-246-5678', 'https://ccsww.org/get-help/housing',
  'https://ccsww.org',
  'Western WA residents. Rental assistance, eviction prevention, housing counseling.',
  'Free', ARRAY['English','Spanish'],
  'https://ccsww.org', '2026-04', 0, 0),

('wa-salvation-army-emergency', 'Salvation Army Emergency Assistance (WA)',
  'emergency_cash', 'faith_based', 'WA', FALSE,
  ARRAY['any','eviction','food','utility_assistance'],
  ARRAY['all'],
  FALSE, 'same_day', TRUE,
  '1-800-SAL-ARMY', 'https://www.salvationarmynw.org',
  'https://www.salvationarmynw.org',
  'Anyone in need. Emergency food, rent, utilities, shelter.',
  'Free', ARRAY['English','Spanish'],
  'https://www.salvationarmynw.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — HEALTHCARE ────────────────────────────────

('wa-apple-health', 'Apple Health (Washington Medicaid)',
  'healthcare', 'state', 'WA', FALSE,
  ARRAY['healthcare','benefits','any'],
  ARRAY['low_income','families','children','pregnant','all'],
  TRUE, '1_week', FALSE,
  '1-855-923-4633', 'https://www.washingtonconnection.org',
  'https://www.hca.wa.gov/apple-health',
  'WA residents meeting income guidelines. Comprehensive health coverage.',
  'Free', ARRAY['English','Spanish','Vietnamese','Somali','Russian'],
  'https://www.hca.wa.gov', '2026-04', 0, 0),

('wa-community-health-centers', 'Washington Community Health Centers (FQHC)',
  'healthcare', 'fqhc', 'WA', FALSE,
  ARRAY['healthcare','any'],
  ARRAY['low_income','uninsured','all'],
  TRUE, '1_week', FALSE,
  NULL, 'https://www.washingtonchc.org/find-a-health-center',
  'https://www.washingtonchc.org',
  'Anyone regardless of ability to pay. Sliding scale fees.',
  'Sliding scale', ARRAY['English','Spanish'],
  'https://www.washingtonchc.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — LEGAL AID ─────────────────────────────────

('wa-northwest-justice-project', 'Northwest Justice Project',
  'legal_aid', 'legal_aid_org', 'WA', FALSE,
  ARRAY['any','eviction','housing_discrimination','employment','benefits','dv'],
  ARRAY['low_income','all'],
  TRUE, '1_week', FALSE,
  '1-888-201-1014', 'https://nwjustice.org/get-legal-help',
  'https://nwjustice.org',
  'Low-income WA residents. Civil legal aid for housing, family, benefits, immigration.',
  'Free', ARRAY['English','Spanish'],
  'https://nwjustice.org', '2026-04', 0, 0),

('wa-columbia-legal-services', 'Columbia Legal Services (WA)',
  'legal_aid', 'legal_aid_org', 'WA', FALSE,
  ARRAY['any','benefits','farmworker','housing','employment'],
  ARRAY['low_income','farmworkers','tribal','immigrants'],
  TRUE, '1_week', FALSE,
  '1-888-201-1014', 'https://columbialegal.org/get-help',
  'https://columbialegal.org',
  'Low-income WA residents, especially farmworkers and rural communities.',
  'Free', ARRAY['English','Spanish'],
  'https://columbialegal.org', '2026-04', 0, 0),

('wa-lawyers-free-legal-answers', 'Washington Lawyers — Free Legal Answers',
  'legal_aid', 'nonprofit', 'WA', FALSE,
  ARRAY['any'],
  ARRAY['low_income','all'],
  TRUE, '1_week', FALSE,
  NULL, 'https://wa.freelegalanswers.org', 'https://wa.freelegalanswers.org',
  'Low-income WA residents. Ask a lawyer a civil legal question online.',
  'Free', ARRAY['English'],
  'https://wa.freelegalanswers.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — DV SERVICES ───────────────────────────────

('wa-sarc-dv', 'Washington State DV Hotline / SARC',
  'dv_services', 'nonprofit', 'WA', FALSE,
  ARRAY['dv','housing','mental_health','any'],
  ARRAY['dv_survivors','all'],
  FALSE, 'same_day', TRUE,
  '1-800-562-6025', NULL, 'https://www.wscadv.org/resources',
  'Anyone experiencing domestic violence in WA. 24/7 crisis line.',
  'Free', ARRAY['English','Spanish','TTY available'],
  'https://www.wscadv.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — VETERANS ──────────────────────────────────

('wa-dvs', 'Washington Dept of Veterans Affairs',
  'veterans', 'state', 'WA', FALSE,
  ARRAY['veterans','benefits','housing','healthcare','any'],
  ARRAY['veterans'],
  FALSE, '1_week', FALSE,
  '1-800-562-2308', 'https://www.dva.wa.gov', 'https://www.dva.wa.gov',
  'Washington State veterans and their families.',
  'Free', ARRAY['English','Spanish'],
  'https://www.dva.wa.gov', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — CHILDCARE ─────────────────────────────────

('wa-wccc', 'Working Connections Child Care (WA)',
  'childcare', 'state', 'WA', FALSE,
  ARRAY['childcare','benefits','employment','any'],
  ARRAY['low_income','families','children'],
  TRUE, '1_week', FALSE,
  '1-877-501-2233', 'https://www.washingtonconnection.org',
  'https://www.dcyf.wa.gov/services/earlylearning-childcare/wccc',
  'WA families working or in school/training. Income-based subsidy.',
  'Free to low-cost', ARRAY['English','Spanish'],
  'https://www.dcyf.wa.gov', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — UNEMPLOYMENT ──────────────────────────────

('wa-unemployment', 'Washington Unemployment Insurance',
  'benefits_navigation', 'state', 'WA', FALSE,
  ARRAY['employment','benefits','any'],
  ARRAY['unemployed','all'],
  FALSE, '1_week', FALSE,
  '1-800-318-6022', 'https://esd.wa.gov/unemployment',
  'https://esd.wa.gov/unemployment',
  'WA workers who lost their job through no fault of their own.',
  'Free', ARRAY['English','Spanish'],
  'https://esd.wa.gov', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — EXPUNGEMENT ───────────────────────────────

('wa-new-leaf', 'New Leaf Project — Record Expungement (WA)',
  'expungement', 'nonprofit', 'WA', FALSE,
  ARRAY['expungement','employment','housing','any'],
  ARRAY['justice_involved','all'],
  FALSE, '1_week', FALSE,
  NULL, 'https://www.newleafproject.org', 'https://www.newleafproject.org',
  'WA residents with qualifying criminal records seeking vacation/expungement.',
  'Free', ARRAY['English','Spanish'],
  'https://www.newleafproject.org', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — DISABILITY ────────────────────────────────

('wa-dshs-dda', 'WA Developmental Disabilities Administration',
  'disability', 'state', 'WA', FALSE,
  ARRAY['disability','benefits','housing','any'],
  ARRAY['disabled','families'],
  FALSE, '1_week', FALSE,
  '1-800-272-8020', 'https://www.dshs.wa.gov/dda',
  'https://www.dshs.wa.gov/dda',
  'WA residents with developmental disabilities.',
  'Free', ARRAY['English','Spanish'],
  'https://www.dshs.wa.gov/dda', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — SENIOR SERVICES ───────────────────────────

('wa-aging-disability-services', 'Aging & Disability Services (WA)',
  'elder_care', 'state', 'WA', FALSE,
  ARRAY['elder_care','benefits','housing','healthcare','any'],
  ARRAY['seniors','disabled'],
  FALSE, '1_week', FALSE,
  '1-800-422-3263', 'https://www.dshs.wa.gov/altsa',
  'https://www.dshs.wa.gov/altsa',
  'WA seniors 60+ and adults with disabilities needing in-home or community services.',
  'Free to sliding scale', ARRAY['English','Spanish'],
  'https://www.dshs.wa.gov/altsa', '2026-04', 0, 0),

-- ─── WASHINGTON STATE — IMMIGRANT SERVICES ────────────────────────

('wa-icwc', 'Immigrant & Refugee Services (WA)',
  'benefits_navigation', 'nonprofit', 'WA', FALSE,
  ARRAY['immigration','benefits','housing','legal_aid','any'],
  ARRAY['immigrants','refugees'],
  FALSE, '1_week', FALSE,
  NULL, 'https://www.icwc.org', 'https://www.icwc.org',
  'Immigrants and refugees in WA. Legal, social, employment services.',
  'Free to sliding scale', ARRAY['English','Spanish','Somali','Arabic'],
  'https://www.icwc.org', '2026-04', 0, 0);
