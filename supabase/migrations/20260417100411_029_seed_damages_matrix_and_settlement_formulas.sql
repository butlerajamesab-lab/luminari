
-- ============================================================
-- MIGRATION 029: Seed damages matrix + settlement formulas
-- From ARTIFACT 2 — 24 damages entries + core formulas
-- ============================================================

INSERT INTO damages_matrix (
  damages_id, claim_type, jurisdiction, harm_category,
  low_award, mid_award, high_award, case_citation, created_at
) VALUES
-- WAGE THEFT
('WAGE_THEFT_LOW_FED','wage_theft','federal','unpaid_minimum_wage',1000,5000,15000,'FLSA §216',0),
('WAGE_THEFT_MID_FED','wage_theft','federal','unpaid_overtime',2000,12000,35000,'FLSA §216',0),
('WAGE_THEFT_HIGH_FED','wage_theft','federal','wage_theft_retaliation',5000,25000,100000,'FLSA §215',0),
('WAGE_THEFT_LOW_WA','wage_theft','WA','unpaid_minimum_wage',1000,6000,20000,'RCW 49.52.050',0),
('WAGE_THEFT_MID_WA','wage_theft','WA','unpaid_overtime',2500,15000,45000,'RCW 49.52.050',0),

-- HOUSING DISCRIMINATION
('HOUSING_DISC_ACTUAL','housing_discrimination','federal','actual_damages_rent',5000,15000,50000,'Fair Housing Act §3602',0),
('HOUSING_DISC_PUNITIVE','housing_discrimination','federal','punitive_damages',0,25000,100000,'Fair Housing Act §3604',0),
('HOUSING_DISC_FEES','housing_discrimination','federal','attorney_fees',3000,12000,50000,'Fair Housing Act §3613',0),

-- INSURANCE DENIAL
('INSURANCE_DENIAL_BENEFIT','insurance_denial','federal','denied_benefit_amount',10000,50000,250000,'State Insurance Code',0),
('INSURANCE_DENIAL_BREACH','insurance_denial','federal','breach_of_contract',5000,20000,75000,'Contract Law',0),

-- BENEFITS DENIAL
('BENEFITS_WRONGFUL_DENIAL','benefits_denial','federal','back_benefits',1000,5000,25000,'Social Security Act',0),
('BENEFITS_ATTORNEY_FEES','benefits_denial','federal','attorney_fees_ssa',1000,5000,7200,'SSA §406',0),

-- DISABILITY DISCRIMINATION
('DISABILITY_DISC_ACTUAL','disability_discrimination','federal','actual_damages_lost_wages',10000,40000,150000,'ADA §1983',0),
('DISABILITY_DISC_PUNITIVE','disability_discrimination','federal','punitive_damages_ada',0,25000,100000,'ADA Title I',0),

-- CONSUMER PROTECTION
('CONSUMER_FRAUD_ACTUAL','consumer_fraud','federal','actual_damages',1000,10000,50000,'FDCPA §1692k',0),
('CONSUMER_FRAUD_STATUTORY','consumer_fraud','federal','statutory_damages',100,1000,1000,'FDCPA §1692k(a)(2)(A)',0),

-- FAMILY LAW
('CUSTODY_VIOLATION_EQUITABLE','custody_violation','WA','attorney_fees_custody',2000,8000,30000,'RCW 26.09.010',0),

-- EMPLOYMENT DISCRIMINATION
('EMPLOYMENT_DISC_BACK_PAY','employment_discrimination','federal','back_pay',10000,40000,150000,'Title VII',0),
('EMPLOYMENT_DISC_EMOTIONAL','employment_discrimination','federal','emotional_distress',5000,20000,75000,'Title VII §1977',0),

-- CIVIL RIGHTS
('CIVIL_RIGHTS_1983_ACTUAL','civil_rights_violation','federal','actual_damages',5000,25000,100000,'42 USC §1983',0),
('CIVIL_RIGHTS_PUNITIVE','civil_rights_violation','federal','punitive_damages',10000,50000,250000,'42 USC §1983',0),

-- WORKERS COMP
('WORKERS_COMP_BACK_PAY','workers_compensation','WA','back_pay_wages',5000,20000,80000,'RCW 51.32.010',0),
('WORKERS_COMP_MEDICAL','workers_compensation','WA','medical_expenses',2000,15000,100000,'RCW 51.36.010',0),

-- MENTAL HEALTH PARITY
('MH_PARITY_DENIAL','mental_health_insurance_denial','federal','denied_benefit_amount',5000,25000,100000,'MHPAEA 29 USC §1185a',0);

-- Settlement formulas
INSERT INTO settlement_calculations (
  calculation_id, claim_type, jurisdiction,
  base_damages, multiplier, formula_applied, case_law_support, created_at
) VALUES
('WAGE_THEFT_FED_001','wage_theft','federal',1.0,2.0,'back_wages * 2.0','FLSA 29 USC §216(b)',0),
('WAGE_THEFT_WA_001','wage_theft','WA',1.0,2.5,'back_wages * 2.5','RCW 49.52.050',0),
('HOUSING_DISC_FED_001','housing_discrimination','federal',15000,2.5,'15000 * 2.5','Fair Housing Act 42 USC §3601',0),
('INSURANCE_RESCISSION_FED_001','insurance_denial','federal',1.0,1.5,'policy_benefit * 1.5','Unfair Insurance Practices Act',0),
('EMPLOYMENT_DISC_FED_001','employment_discrimination','federal',1.0,3.0,'back_pay * 3.0','Title VII 42 USC §2000e',0),
('CIVIL_RIGHTS_1983_001','civil_rights_violation','federal',1.0,2.0,'actual_damages * 2.0','42 USC §1983',0),
('BENEFITS_DENIAL_SSA_001','benefits_denial','federal',1.0,1.0,'back_benefits * 1.0','Social Security Act §205',0),
('CONSUMER_FDCPA_001','consumer_fraud','federal',1000,1.0,'statutory_damages + actual_damages','FDCPA §1692k',0);
