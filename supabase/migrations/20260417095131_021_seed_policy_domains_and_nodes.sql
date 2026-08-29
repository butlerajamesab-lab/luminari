
-- ============================================================
-- MIGRATION 021: Policy Domains + Geographic Nodes
-- ============================================================

INSERT INTO policy_domains (domain_id, name, description, created_at) VALUES
('insurance_denials', 'Insurance Claim Denials (Medical, Life, Disability)', 'Cross-referenced evidence extraction for claim denials across medical, life, disability, and specialty insurance', 0),
('government_benefits', 'Government Benefits Denials (SSDI, SSI, Medicaid, SNAP)', 'Social Security, Medicaid, SNAP, veterans benefits, and other government benefit denials', 0),
('workers_compensation', 'Workers'' Compensation Claim Denials', 'Injured worker claims denied by employer insurers, IME disputes, wage loss appeals', 0),
('criminal_justice', 'Criminal Justice (Wrongful Conviction, Post-Conviction Review, Police Misconduct)', 'Innocence organizations, post-conviction advocacy, civilian complaint processes', 0),
('debt_collection', 'Debt Collection Defense (FDCPA, Fair Debt Practices)', 'FDCPA violations, debt collection defenses, validation disputes', 0),
('environmental_justice', 'Environmental Justice & Toxic Exposure', 'Communities near industrial sites, contaminated water/air, EPA compliance', 0),
('healthcare_access', 'Healthcare Access & Medical Advocacy', 'Medical malpractice pre-screening, treatment denials, informed consent', 0),
('housing_landlord', 'Housing & Landlord-Tenant Disputes', 'Unlawful evictions, tenant rights, HOA disputes, habitability claims', 0),
('mental_health_crisis', 'Mental Health System & Crisis Advocacy', 'Mental health insurance denial, crisis response accountability, psychiatric hold appeals, peer support', 0),
('civil_rights', 'Civil Rights & Discrimination (Employment, Housing, Public Accommodation)', 'Employment discrimination, housing discrimination, public accommodation violations', 0),
('tribal_sovereignty', 'Tribal Sovereignty & Indian Country Jurisdiction', 'Tribal law compliance, ICWA enforcement, jurisdictional conflicts', 0),
('government_transparency', 'Government Transparency & FOIA Access', 'FOIA compliance, record access delays, transparency enforcement — core to Luminari mission', 0);

-- Geographic nodes
INSERT INTO geographic_nodes (node_id, city, state, status, target_launch, rationale, regional_org_names, regional_legislator_names, created_at) VALUES
('seattle_node', 'Seattle', 'WA', 'active', NULL, 'True north — Washington State AKB coverage, first built', 
  ARRAY['Seattle Police Accountability Coalition','Community Alliance for Tenants','Seattle Workers'' Compensation Clinic','Seattle Mental Health Alliance','Seattle Crisis Response Network','Seattle Transparency & Accountability Coalition'],
  ARRAY['Pramila Jayapal','Manka Dhingra','Rebecca Saldaña','Claire Wilson'],
  0),
('denver_node', 'Denver', 'CO', 'active', NULL, 'Active node — environmental justice, tribal advocacy, criminal justice reform',
  ARRAY['Communities United for Environmental Justice','Denver Tenants Union','Denver Mental Health Alliance','Colorado Innocence Project','Indian Child Welfare Law Center'],
  ARRAY['Cathy Kipp','Colorado representatives and senators'],
  0),
('phoenix_node', 'Phoenix', 'AZ', 'active', NULL, 'Active node — mental health, housing, environmental, tribal',
  ARRAY['Phoenix Peer Support & Mental Health Coalition','Community Legal Services (Phoenix)','Arizona DCS advocates'],
  ARRAY['Raúl Grijalva','Arizona state representatives and senators'],
  0),
('new_york_node', 'New York', 'NY', 'planned', 'Q3 2026', 'Major legal services hub, ACLU/Lambda/NAACP presence, high litigation volume',
  ARRAY['Legal Aid Society','ACLU NY','Lambda Legal (NY office)','NAACP LDF'],
  NULL,
  0),
('los_angeles_node', 'Los Angeles', 'CA', 'planned', 'Q3 2026', 'Large underserved population, environmental justice hub, entertainment labor issues',
  ARRAY['National Consumer Law Center (CA presence)','ACLU Southern California'],
  NULL,
  0),
('chicago_node', 'Chicago', 'IL', 'planned', 'Q4 2026', 'Major legal aid hub, government accountability focus, FOIA expertise',
  ARRAY['Legal Aid Chicago','Project on Government Oversight'],
  NULL,
  0),
('dc_node', 'Washington', NULL, 'planned', 'Q4 2026', 'Federal agency concentration, legislative focus, policy implementation monitoring',
  ARRAY['NFIC','POGO','National alliance organizations'],
  NULL,
  0);
