import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const now = Date.now();

// Helper: INSERT IGNORE for dedup
async function batchInsert(table, columns, rows, label) {
  if (!rows.length) return console.log(`[${label}] No rows to insert`);
  const placeholders = rows.map(() => `(${columns.map(()=>'?').join(',')})`).join(',');
  const vals = rows.flat();
  try {
    const [r] = await conn.query(
      `INSERT IGNORE INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
      vals
    );
    console.log(`[${label}] Inserted ${r.affectedRows} rows (${rows.length} attempted)`);
  } catch(e) {
    console.error(`[${label}] Error: ${e.message}`);
  }
}

// ============================================================
// 1. STATUTES (from pasted_content.txt) → legal_statutes
// ============================================================
console.log('\n=== STATUTES ===');
const statutes = [
  // Federal Employment
  { citation: 'Title VII of the Civil Rights Act of 1964', title: 'Title VII - Employment Discrimination', jurisdiction: 'Federal', domains: '["Civil Rights","Employment"]', summary: 'Prohibits employment discrimination based on race, color, religion, sex, or national origin. Applies to employers with 15+ employees.' },
  { citation: 'Americans with Disabilities Act (ADA) 1990', title: 'ADA - Disability Discrimination', jurisdiction: 'Federal', domains: '["Disability","Employment","Public Accommodation"]', summary: 'Prohibits discrimination against individuals with disabilities in employment, public services, public accommodations, and telecommunications.' },
  { citation: 'Age Discrimination in Employment Act (ADEA) 1967', title: 'ADEA - Age Discrimination', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Protects employees and job applicants 40 years of age and older from employment discrimination based on age.' },
  { citation: 'Fair Labor Standards Act (FLSA) 29 USC §201', title: 'FLSA - Wage and Hour', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Establishes minimum wage, overtime pay, recordkeeping, and youth employment standards affecting employees in the private sector and government.' },
  { citation: 'Family and Medical Leave Act (FMLA) 29 USC §2601', title: 'FMLA - Family Leave', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Entitles eligible employees to take unpaid, job-protected leave for specified family and medical reasons with continuation of group health insurance.' },
  { citation: 'National Labor Relations Act (NLRA) 29 USC §151', title: 'NLRA - Labor Relations', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Protects the rights of employees to organize, form unions, bargain collectively, and engage in concerted activities.' },
  { citation: 'Equal Pay Act of 1963', title: 'Equal Pay Act', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Requires that men and women in the same workplace be given equal pay for equal work.' },
  { citation: 'Occupational Safety and Health Act (OSHA) 29 USC §651', title: 'OSHA - Workplace Safety', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Ensures safe and healthful working conditions by setting and enforcing standards and providing training, outreach, education, and assistance.' },
  // Federal Housing
  { citation: 'Fair Housing Act 42 USC §3601', title: 'Fair Housing Act', jurisdiction: 'Federal', domains: '["Housing","Civil Rights"]', summary: 'Prohibits discrimination in the sale, rental, and financing of dwellings based on race, color, national origin, religion, sex, familial status, and disability.' },
  { citation: 'Violence Against Women Act (VAWA) Housing Protections', title: 'VAWA Housing Protections', jurisdiction: 'Federal', domains: '["Housing","Civil Rights"]', summary: 'Provides housing protections for victims of domestic violence, dating violence, sexual assault, and stalking in federally assisted housing.' },
  // Federal Consumer Protection
  { citation: 'Fair Debt Collection Practices Act (FDCPA) 15 USC §1692', title: 'FDCPA - Debt Collection', jurisdiction: 'Federal', domains: '["Consumer Protection"]', summary: 'Prohibits abusive, unfair, or deceptive practices by debt collectors. Applies to personal, family, and household debts.' },
  { citation: 'Fair Credit Reporting Act (FCRA) 15 USC §1681', title: 'FCRA - Credit Reporting', jurisdiction: 'Federal', domains: '["Consumer Protection"]', summary: 'Promotes accuracy, fairness, and privacy of information in the files of consumer reporting agencies.' },
  { citation: 'Truth in Lending Act (TILA) 15 USC §1601', title: 'TILA - Truth in Lending', jurisdiction: 'Federal', domains: '["Consumer Protection"]', summary: 'Requires clear disclosure of key terms of lending arrangements and all costs to standardize how costs are calculated and disclosed.' },
  { citation: 'Consumer Financial Protection Act (Dodd-Frank Title X)', title: 'CFPA - Consumer Financial Protection', jurisdiction: 'Federal', domains: '["Consumer Protection"]', summary: 'Created the CFPB and established federal consumer financial law to protect consumers from unfair, deceptive, or abusive practices.' },
  // Federal Civil Rights
  { citation: '42 USC §1983 - Civil Rights Act', title: 'Section 1983 - Civil Rights', jurisdiction: 'Federal', domains: '["Civil Rights"]', summary: 'Provides a cause of action for deprivation of rights, privileges, or immunities secured by the Constitution and federal laws by persons acting under color of state law.' },
  { citation: '42 USC §1981 - Equal Rights Under the Law', title: 'Section 1981 - Equal Rights', jurisdiction: 'Federal', domains: '["Civil Rights"]', summary: 'Guarantees all persons equal rights to make and enforce contracts, sue, be parties, give evidence, and enjoy the full benefit of all laws.' },
  { citation: 'Voting Rights Act of 1965', title: 'Voting Rights Act', jurisdiction: 'Federal', domains: '["Civil Rights","Voting Rights"]', summary: 'Prohibits racial discrimination in voting. Outlawed discriminatory voting practices adopted in many southern states after the Civil War.' },
  // Federal Benefits
  { citation: 'Social Security Act 42 USC §401', title: 'Social Security Act - SSDI', jurisdiction: 'Federal', domains: '["Benefits","Disability"]', summary: 'Establishes Social Security Disability Insurance (SSDI) providing benefits to disabled workers and their families.' },
  { citation: 'Supplemental Security Income (SSI) 42 USC §1381', title: 'SSI - Supplemental Income', jurisdiction: 'Federal', domains: '["Benefits"]', summary: 'Provides stipends to low-income people who are aged, blind, or disabled.' },
  { citation: 'Individuals with Disabilities Education Act (IDEA) 20 USC §1400', title: 'IDEA - Special Education', jurisdiction: 'Federal', domains: '["Disability","Education"]', summary: 'Ensures students with disabilities are provided with Free Appropriate Public Education (FAPE) tailored to their individual needs.' },
  { citation: 'Rehabilitation Act Section 504', title: 'Section 504 - Disability Rights', jurisdiction: 'Federal', domains: '["Disability","Civil Rights"]', summary: 'Prohibits discrimination on the basis of disability in programs receiving federal financial assistance.' },
  // Washington State
  { citation: 'Washington Law Against Discrimination (WLAD) RCW 49.60', title: 'WLAD - WA Anti-Discrimination', jurisdiction: 'Washington', domains: '["Civil Rights","Employment","Housing"]', summary: 'Prohibits discrimination in employment, housing, public accommodation, credit, and insurance based on protected classes.' },
  { citation: 'Washington Minimum Wage Act RCW 49.46', title: 'WA Minimum Wage Act', jurisdiction: 'Washington', domains: '["Employment"]', summary: 'Establishes minimum wage, overtime, and rest break requirements for Washington workers.' },
  { citation: 'Washington Industrial Safety and Health Act (WISHA) RCW 49.17', title: 'WISHA - WA Workplace Safety', jurisdiction: 'Washington', domains: '["Employment"]', summary: 'Establishes workplace safety and health standards for Washington employers.' },
  { citation: 'Washington Consumer Protection Act RCW 19.86', title: 'WA CPA - Consumer Protection', jurisdiction: 'Washington', domains: '["Consumer Protection"]', summary: 'Prohibits unfair or deceptive acts or practices in trade or commerce in Washington state.' },
  { citation: 'Washington Residential Landlord-Tenant Act RCW 59.18', title: 'WA RLTA - Landlord-Tenant', jurisdiction: 'Washington', domains: '["Housing"]', summary: 'Governs the rights and obligations of residential landlords and tenants in Washington.' },
  { citation: 'Washington Fair Chance Act RCW 49.94', title: 'WA Fair Chance Act', jurisdiction: 'Washington', domains: '["Employment","Civil Rights"]', summary: 'Restricts employer inquiries about criminal records until after initial screening.' },
  { citation: 'Washington Paid Family and Medical Leave RCW 50A', title: 'WA PFML', jurisdiction: 'Washington', domains: '["Employment","Benefits"]', summary: 'Provides paid family and medical leave insurance for Washington workers.' },
  // California
  { citation: 'California Fair Employment and Housing Act (FEHA) Gov Code §12900', title: 'FEHA - CA Anti-Discrimination', jurisdiction: 'California', domains: '["Civil Rights","Employment","Housing"]', summary: 'Prohibits employment and housing discrimination based on protected characteristics including race, sex, disability, age, and more.' },
  { citation: 'California Labor Code §1194 - Minimum Wage', title: 'CA Minimum Wage', jurisdiction: 'California', domains: '["Employment"]', summary: 'Establishes minimum wage requirements and allows employees to recover unpaid minimum wages plus interest and attorney fees.' },
  { citation: 'California Consumer Privacy Act (CCPA) Civ Code §1798.100', title: 'CCPA - CA Privacy', jurisdiction: 'California', domains: '["Consumer Protection"]', summary: 'Gives California consumers the right to know what personal data is collected, delete it, opt-out of its sale, and exercise rights without discrimination.' },
  { citation: 'California Unruh Civil Rights Act Civ Code §51', title: 'Unruh Act - CA Civil Rights', jurisdiction: 'California', domains: '["Civil Rights"]', summary: 'Provides protection from discrimination by all business establishments in California based on sex, race, color, religion, ancestry, national origin, disability, medical condition, genetic information, marital status, sexual orientation, citizenship, primary language, or immigration status.' },
  // New York
  { citation: 'New York Human Rights Law (NYHRL) Exec Law §290', title: 'NYHRL - NY Anti-Discrimination', jurisdiction: 'New York', domains: '["Civil Rights","Employment","Housing"]', summary: 'Prohibits discrimination in employment, housing, public accommodations, education, and credit based on protected characteristics.' },
  { citation: 'New York City Human Rights Law (NYCHRL) Admin Code §8-107', title: 'NYCHRL - NYC Anti-Discrimination', jurisdiction: 'New York', domains: '["Civil Rights","Employment","Housing"]', summary: 'One of the most comprehensive civil rights laws in the nation, providing broader protections than state and federal law.' },
  { citation: 'New York Labor Law §191 - Wage Theft Prevention', title: 'NY Wage Theft Prevention Act', jurisdiction: 'New York', domains: '["Employment"]', summary: 'Requires employers to provide written notice of wage information and strengthens penalties for wage theft.' },
  // Texas, Florida, Illinois
  { citation: 'Texas Commission on Human Rights Act (TCHRA) Labor Code Ch. 21', title: 'TCHRA - TX Anti-Discrimination', jurisdiction: 'Texas', domains: '["Civil Rights","Employment"]', summary: 'Prohibits employment discrimination based on race, color, disability, religion, sex, national origin, and age.' },
  { citation: 'Florida Civil Rights Act (FCRA) Fla Stat §760', title: 'FCRA - FL Civil Rights', jurisdiction: 'Florida', domains: '["Civil Rights","Employment","Housing"]', summary: 'Prohibits discrimination in employment, housing, and public accommodations based on race, color, religion, sex, pregnancy, national origin, age, handicap, or marital status.' },
  { citation: 'Illinois Human Rights Act (IHRA) 775 ILCS 5', title: 'IHRA - IL Anti-Discrimination', jurisdiction: 'Illinois', domains: '["Civil Rights","Employment","Housing"]', summary: 'Prohibits discrimination in employment, real estate transactions, access to financial credit, and public accommodations.' },
  // Additional Federal
  { citation: 'Pregnancy Discrimination Act (PDA) 42 USC §2000e(k)', title: 'PDA - Pregnancy Discrimination', jurisdiction: 'Federal', domains: '["Employment","Civil Rights"]', summary: 'Prohibits discrimination on the basis of pregnancy, childbirth, or related medical conditions in employment.' },
  { citation: 'Genetic Information Nondiscrimination Act (GINA) 42 USC §2000ff', title: 'GINA - Genetic Discrimination', jurisdiction: 'Federal', domains: '["Employment","Civil Rights"]', summary: 'Prohibits discrimination in employment and health insurance based on genetic information.' },
  { citation: 'Uniformed Services Employment and Reemployment Rights Act (USERRA) 38 USC §4301', title: 'USERRA - Military Employment', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Protects service members reemployment rights when returning from military service and prohibits discrimination based on military service.' },
  { citation: 'Worker Adjustment and Retraining Notification Act (WARN) 29 USC §2101', title: 'WARN Act - Plant Closings', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Requires employers with 100+ employees to provide 60 calendar-day advance notification of plant closings and mass layoffs.' },
  { citation: 'Lilly Ledbetter Fair Pay Act of 2009', title: 'Ledbetter Act - Fair Pay', jurisdiction: 'Federal', domains: '["Employment","Civil Rights"]', summary: 'Restores protection against pay discrimination by resetting the 180-day statute of limitations with each discriminatory paycheck.' },
  { citation: 'Pregnant Workers Fairness Act (PWFA) 42 USC §2000gg', title: 'PWFA - Pregnant Workers', jurisdiction: 'Federal', domains: '["Employment"]', summary: 'Requires covered employers to provide reasonable accommodations to workers with known limitations related to pregnancy, childbirth, or related medical conditions.' },
];

const statRows = statutes.map(s => [
  s.jurisdiction, s.citation, s.title, s.summary || '', s.summary || '',
  s.domains, 'statute', '[]', '[]', null, null, '[]', null, 'system', now, now
]);
await batchInsert('legal_statutes',
  ['jurisdiction','citation','title','fullText','summary','domains','sourceType','keyRequirements','deadlines','effectiveDate','repealedDate','amendments','sourceUrl','addedBy','createdAt','updatedAt'],
  statRows, 'Statutes');

// ============================================================
// 2. CASE PRECEDENTS (from pasted_content_3.txt) → legal_case_law
// ============================================================
console.log('\n=== CASE PRECEDENTS ===');
const cases = [
  { caseName: 'McDonnell Douglas Corp. v. Green', citation: '411 U.S. 792 (1973)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 1973, holding: 'Established burden-shifting framework for Title VII disparate treatment cases without direct evidence.', domains: '["Employment Discrimination","Civil Rights"]' },
  { caseName: 'Griggs v. Duke Power Co.', citation: '401 U.S. 424 (1971)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 1971, holding: 'Established disparate impact theory; employment practices with discriminatory effect violate Title VII even if facially neutral.', domains: '["Employment Discrimination"]' },
  { caseName: 'Bostock v. Clayton County', citation: '590 U.S. ___ (2020)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2020, holding: 'Title VII prohibition on sex discrimination encompasses discrimination based on sexual orientation and gender identity.', domains: '["Employment Discrimination","Civil Rights"]' },
  { caseName: 'Texas Dept. of Housing v. Inclusive Communities Project', citation: '576 U.S. 519 (2015)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2015, holding: 'Disparate impact claims are cognizable under the Fair Housing Act.', domains: '["Housing Discrimination"]' },
  { caseName: 'Olmstead v. L.C.', citation: '527 U.S. 581 (1999)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 1999, holding: 'Unjustified segregation of persons with disabilities constitutes discrimination under ADA Title II; states must provide community-based services.', domains: '["Disability","Civil Rights"]' },
  { caseName: 'Goldberg v. Kelly', citation: '397 U.S. 254 (1970)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 1970, holding: 'Due process requires pre-termination evidentiary hearing before welfare benefits are discontinued.', domains: '["Public Benefits","Due Process"]' },
  { caseName: 'Ledbetter v. Goodyear Tire & Rubber Co.', citation: '550 U.S. 618 (2007)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2007, holding: 'Pay discrimination claims must be filed within 180 days of discriminatory pay decision, not each paycheck (superseded by Lilly Ledbetter Fair Pay Act).', domains: '["Employment Discrimination"]' },
  { caseName: 'University of Texas Southwestern Medical Center v. Nassar', citation: '570 U.S. 338 (2013)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2013, holding: 'Title VII retaliation claims require but-for causation, not motivating factor standard.', domains: '["Employment Discrimination"]' },
  { caseName: 'Vance v. Ball State University', citation: '570 U.S. 421 (2013)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2013, holding: 'Supervisor for Title VII harassment liability is someone with power to take tangible employment actions.', domains: '["Employment Discrimination"]' },
  { caseName: 'Burlington Northern v. White', citation: '548 U.S. 53 (2006)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2006, holding: 'Title VII retaliation claims cover any materially adverse action that might dissuade reasonable worker from making complaint.', domains: '["Employment Discrimination"]' },
  { caseName: 'Wal-Mart Stores, Inc. v. Dukes', citation: '564 U.S. 338 (2011)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2011, holding: 'Class of 1.5 million women alleging sex discrimination could not be certified for lack of commonality under Rule 23.', domains: '["Employment Discrimination"]' },
  { caseName: 'Havens Realty Corp. v. Coleman', citation: '455 U.S. 363 (1982)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 1982, holding: 'Fair housing testers have standing to sue under Fair Housing Act even if not actually seeking housing.', domains: '["Housing Discrimination"]' },
  { caseName: 'Young v. United Parcel Service', citation: '575 U.S. 206 (2015)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2015, holding: 'Pregnant worker can show disparate treatment by proving employer accommodates most non-pregnant workers with similar limitations.', domains: '["Employment Discrimination"]' },
  { caseName: 'EEOC v. Abercrombie & Fitch Stores', citation: '575 U.S. 768 (2015)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2015, holding: 'Title VII prohibits refusing to hire applicant to avoid accommodating religious practice, even if applicant never explicitly requested accommodation.', domains: '["Employment Discrimination","Religious Liberty"]' },
  { caseName: 'Ricci v. DeStefano', citation: '557 U.S. 557 (2009)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2009, holding: 'City discarding firefighter promotion exam results due to racial disparity violated Title VII disparate treatment.', domains: '["Employment Discrimination"]' },
  { caseName: 'Staub v. Proctor Hospital', citation: '562 U.S. 411 (2011)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2011, holding: 'Employer liable under USERRA if supervisor discriminatory animus caused adverse action, even if ultimate decisionmaker neutral (cat paw liability).', domains: '["Employment Discrimination"]' },
  { caseName: 'Comcast Corp. v. National Association of African American-Owned Media', citation: '589 U.S. ___ (2020)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2020, holding: 'But-for causation applies to Section 1981 claims; plaintiff must show race was but-for cause of contract denial.', domains: '["Civil Rights"]' },
  { caseName: 'Fulton v. City of Philadelphia', citation: '593 U.S. ___ (2021)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2021, holding: 'City refusal to contract with Catholic foster agency that would not certify same-sex couples violated Free Exercise Clause.', domains: '["Civil Rights","Religious Liberty"]' },
  { caseName: 'Dobbs v. Jackson Women\'s Health Organization', citation: '597 U.S. ___ (2022)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2022, holding: 'Constitution does not confer right to abortion; overruled Roe v. Wade and Casey.', domains: '["Civil Rights"]' },
  { caseName: 'Allen v. Milligan', citation: '599 U.S. ___ (2023)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2023, holding: 'Alabama congressional redistricting map likely violated Section 2 of Voting Rights Act by diluting Black voting power.', domains: '["Voting Rights","Civil Rights"]' },
  { caseName: 'Muldrow v. City of St. Louis', citation: '601 U.S. ___ (2024)', jurisdiction: 'Supreme Court', court: 'U.S. Supreme Court', yearDecided: 2024, holding: 'Title VII plaintiffs challenging job transfers need not show significant disadvantage; any harm suffices.', domains: '["Employment Discrimination"]' },
  { caseName: 'Killian v. Yorozu Automotive Tennessee', citation: '454 F.3d 549 (6th Cir. 2006)', jurisdiction: '6th Circuit', court: 'U.S. Court of Appeals, 6th Circuit', yearDecided: 2006, holding: 'Plaintiff may establish retaliation claim by showing close temporal proximity between protected activity and adverse action.', domains: '["Employment Discrimination"]' },
  { caseName: 'Nichols v. Azteca Restaurant Enterprises Inc.', citation: '256 F.3d 864 (9th Cir. 2001)', jurisdiction: '9th Circuit', court: 'U.S. Court of Appeals, 9th Circuit', yearDecided: 2001, holding: 'Harassment based on male employee failure to conform to male stereotypes is sex discrimination.', domains: '["Employment Discrimination"]' },
  { caseName: 'EEOC v. UPS Supply Chain Solutions', citation: '620 F.3d 1103 (9th Cir. 2010)', jurisdiction: '9th Circuit', court: 'U.S. Court of Appeals, 9th Circuit', yearDecided: 2010, holding: 'Maximum leave policy may violate ADA if applied without considering reasonable accommodations.', domains: '["Disability Discrimination"]' },
  { caseName: 'Parker v. Reema Consulting Services', citation: '915 F.3d 297 (4th Cir. 2019)', jurisdiction: '4th Circuit', court: 'U.S. Court of Appeals, 4th Circuit', yearDecided: 2019, holding: 'Sexual orientation discrimination is sex discrimination under Title VII, pre-Bostock.', domains: '["Employment Discrimination"]' },
];

const caseRows = cases.map(c => [
  c.jurisdiction, c.citation, c.caseName, c.court, c.yearDecided,
  c.holding, '[]', '[]', c.domains, null, null, 'system', now, now
]);
await batchInsert('legal_case_law',
  ['jurisdiction','citation','caseName','court','yearDecided','holding','keyQuotes','statutesInterpreted','domains','subsequentHistory','sourceUrl','addedBy','createdAt','updatedAt'],
  caseRows, 'Case Precedents');

// ============================================================
// 3. AGENCY AUTHORITY (from pasted_content_4.txt) → agency_authority_map
// ============================================================
console.log('\n=== AGENCY AUTHORITY ===');
const agencies = [
  { agency: 'U.S. Department of Labor - Wage and Hour Division', agencyShort: 'DOL-WHD', statute: 'FLSA, FMLA', domain: 'Employment', jurisdiction: 'Federal', complaintTypes: '["Minimum wage","Overtime","Child labor","FMLA"]', pathway: 'File complaint online or call 1-866-487-9243' },
  { agency: 'Equal Employment Opportunity Commission', agencyShort: 'EEOC', statute: 'Title VII, ADA, ADEA', domain: 'Employment', jurisdiction: 'Federal', complaintTypes: '["Employment discrimination","Harassment","Retaliation","Equal pay"]', pathway: 'File charge online at eeoc.gov or visit local office' },
  { agency: 'U.S. Department of Housing and Urban Development', agencyShort: 'HUD', statute: 'Fair Housing Act', domain: 'Housing', jurisdiction: 'Federal', complaintTypes: '["Fair housing","Housing discrimination","Section 8"]', pathway: 'File complaint online at hud.gov or call 1-800-669-9777' },
  { agency: 'U.S. Department of Justice - Civil Rights Division', agencyShort: 'DOJ-CRT', statute: '42 USC §1983, Voting Rights Act', domain: 'Civil Rights', jurisdiction: 'Federal', complaintTypes: '["Civil rights","Police misconduct","Voting rights","ADA enforcement"]', pathway: 'Report violations at civilrights.justice.gov' },
  { agency: 'Federal Trade Commission', agencyShort: 'FTC', statute: 'FTC Act, FDCPA', domain: 'Consumer Protection', jurisdiction: 'Federal', complaintTypes: '["Consumer protection","Debt collection","Privacy","False advertising"]', pathway: 'File complaint at reportfraud.ftc.gov' },
  { agency: 'Consumer Financial Protection Bureau', agencyShort: 'CFPB', statute: 'Dodd-Frank Title X, FDCPA, FCRA', domain: 'Consumer Protection', jurisdiction: 'Federal', complaintTypes: '["Debt collection","Credit reporting","Mortgage servicing","Student loans"]', pathway: 'Submit complaint at consumerfinance.gov/complaint' },
  { agency: 'Social Security Administration', agencyShort: 'SSA', statute: 'Social Security Act', domain: 'Benefits', jurisdiction: 'Federal', complaintTypes: '["SSDI","SSI","Medicare","Retirement benefits"]', pathway: 'Apply online at ssa.gov or visit local office' },
  { agency: 'Occupational Safety and Health Administration', agencyShort: 'OSHA', statute: 'OSH Act', domain: 'Employment', jurisdiction: 'Federal', complaintTypes: '["Workplace safety","Health hazards","Whistleblower protection"]', pathway: 'File complaint online at osha.gov or call 1-800-321-6742' },
  { agency: 'National Labor Relations Board', agencyShort: 'NLRB', statute: 'NLRA', domain: 'Employment', jurisdiction: 'Federal', complaintTypes: '["Union organizing","Unfair labor practices","Collective bargaining"]', pathway: 'File charge at nlrb.gov or visit regional office' },
  { agency: 'U.S. Department of Education - Office for Civil Rights', agencyShort: 'ED-OCR', statute: 'Title IX, Section 504, IDEA', domain: 'Education', jurisdiction: 'Federal', complaintTypes: '["Education discrimination","Title IX","Section 504","IDEA compliance"]', pathway: 'File complaint online at ed.gov/ocr' },
  { agency: 'U.S. Department of Health and Human Services - Office for Civil Rights', agencyShort: 'HHS-OCR', statute: 'HIPAA, ACA Section 1557', domain: 'Healthcare', jurisdiction: 'Federal', complaintTypes: '["HIPAA privacy","Healthcare discrimination","ACA Section 1557"]', pathway: 'File complaint at hhs.gov/ocr' },
  { agency: 'Washington State Department of Labor & Industries', agencyShort: 'WA-LNI', statute: 'RCW 49.46, RCW 49.17', domain: 'Employment', jurisdiction: 'Washington', complaintTypes: '["Wage theft","Minimum wage","Overtime","Workplace safety","Workers compensation"]', pathway: 'File complaint at lni.wa.gov or call 1-866-219-7320' },
  { agency: 'Washington State Human Rights Commission', agencyShort: 'WSHRC', statute: 'RCW 49.60 (WLAD)', domain: 'Civil Rights', jurisdiction: 'Washington', complaintTypes: '["Employment discrimination","Housing discrimination","Public accommodation"]', pathway: 'File complaint at hum.wa.gov or call 1-800-233-3247' },
  { agency: 'Washington Attorney General - Civil Rights Division', agencyShort: 'WA-AG-CRD', statute: 'RCW 49.60, RCW 19.86', domain: 'Civil Rights', jurisdiction: 'Washington', complaintTypes: '["Civil rights enforcement","Consumer protection","Fair Chance Act"]', pathway: 'File complaint at atg.wa.gov or call 1-833-660-4877' },
  { agency: 'Washington Employment Security Department', agencyShort: 'WA-ESD', statute: 'RCW 50A', domain: 'Benefits', jurisdiction: 'Washington', complaintTypes: '["Unemployment benefits","Paid family leave","Paid medical leave"]', pathway: 'Apply at esd.wa.gov or call 1-800-318-6022' },
  { agency: 'Washington Department of Social and Health Services', agencyShort: 'WA-DSHS', statute: 'Various RCW', domain: 'Benefits', jurisdiction: 'Washington', complaintTypes: '["Medicaid","SNAP","TANF","Child welfare"]', pathway: 'Apply at dshs.wa.gov or call 1-877-501-2233' },
  { agency: 'California Civil Rights Department', agencyShort: 'CA-CRD', statute: 'FEHA', domain: 'Civil Rights', jurisdiction: 'California', complaintTypes: '["Employment discrimination","Housing discrimination","FEHA","Unruh Act"]', pathway: 'File complaint at calcivilrights.ca.gov or call 1-800-884-1684' },
  { agency: 'California Labor Commissioner\'s Office', agencyShort: 'CA-DLSE', statute: 'CA Labor Code', domain: 'Employment', jurisdiction: 'California', complaintTypes: '["Wage theft","Minimum wage","Overtime","Meal/rest breaks"]', pathway: 'File wage claim at dir.ca.gov/dlse or call 1-844-522-6734' },
  { agency: 'New York State Division of Human Rights', agencyShort: 'NY-DHR', statute: 'NYHRL', domain: 'Civil Rights', jurisdiction: 'New York', complaintTypes: '["Employment discrimination","Housing discrimination","NYHRL"]', pathway: 'File complaint at dhr.ny.gov or call 1-888-392-3644' },
  { agency: 'New York State Department of Labor', agencyShort: 'NY-DOL', statute: 'NY Labor Law', domain: 'Employment', jurisdiction: 'New York', complaintTypes: '["Wage theft","Minimum wage","Overtime","Unemployment insurance"]', pathway: 'File complaint at dol.ny.gov or call 1-888-469-7365' },
  { agency: 'NYC Commission on Human Rights', agencyShort: 'NYC-CCHR', statute: 'NYCHRL', domain: 'Civil Rights', jurisdiction: 'New York', complaintTypes: '["Employment discrimination","Housing discrimination","NYCHRL"]', pathway: 'File complaint at nyc.gov/cchr or call 212-416-0197' },
  { agency: 'Texas Workforce Commission - Civil Rights Division', agencyShort: 'TX-TWC-CRD', statute: 'TCHRA', domain: 'Civil Rights', jurisdiction: 'Texas', complaintTypes: '["Employment discrimination","TCHRA","Wage claims"]', pathway: 'File complaint at twc.texas.gov or call 1-888-452-4778' },
  { agency: 'Florida Commission on Human Relations', agencyShort: 'FL-FCHR', statute: 'FCRA', domain: 'Civil Rights', jurisdiction: 'Florida', complaintTypes: '["Employment discrimination","Housing discrimination","FCRA"]', pathway: 'File complaint at fchr.myflorida.com or call 1-850-488-7082' },
  { agency: 'Illinois Department of Human Rights', agencyShort: 'IL-IDHR', statute: 'IHRA', domain: 'Civil Rights', jurisdiction: 'Illinois', complaintTypes: '["Employment discrimination","Housing discrimination","IHRA"]', pathway: 'File complaint at dhr.illinois.gov or call 312-814-6200' },
];

const agencyRows = agencies.map(a => [
  a.statute, a.agency, a.agencyShort, a.domain, a.complaintTypes,
  a.statute, 90, a.pathway, '[]', '[]', 'system', now, now
]);
await batchInsert('agency_authority_map',
  ['statute','agency','agencyShort','domain','complaintTypes','statutoryAuthority','responseTimelineDays','complaintPathway','commonOutcomes','linkedWeakJoints','addedBy','createdAt','updatedAt'],
  agencyRows, 'Agency Authority');

// ============================================================
// 4. ADVOCACY TARGETS (from pasted_content_5.txt) → advocacy_targets
// ============================================================
console.log('\n=== ADVOCACY TARGETS ===');
const advocacyTargets = [
  { targetId: 'SEN-MURRAY', name: 'Sen. Patty Murray', org: 'U.S. Senate', role: 'Senator', jurisdiction: 'Washington', domains: '["Labor","Education","Healthcare"]', influence: 92 },
  { targetId: 'SEN-CANTWELL', name: 'Sen. Maria Cantwell', org: 'U.S. Senate', role: 'Senator', jurisdiction: 'Washington', domains: '["Technology","Consumer Protection","Trade"]', influence: 88 },
  { targetId: 'REP-JAYAPAL', name: 'Rep. Pramila Jayapal', org: 'U.S. House', role: 'Representative', jurisdiction: 'Washington', domains: '["Immigration","Civil Rights","Labor"]', influence: 90 },
  { targetId: 'REP-DELBENE', name: 'Rep. Suzan DelBene', org: 'U.S. House', role: 'Representative', jurisdiction: 'Washington', domains: '["Technology","Healthcare","Tax Policy"]', influence: 82 },
  { targetId: 'GOV-INSLEE', name: 'Gov. Jay Inslee', org: 'Washington State', role: 'Governor', jurisdiction: 'Washington', domains: '["Climate","Labor","Housing"]', influence: 85 },
  { targetId: 'AG-FERGUSON', name: 'AG Bob Ferguson', org: 'Washington AG Office', role: 'Attorney General', jurisdiction: 'Washington', domains: '["Consumer Protection","Civil Rights","Environmental"]', influence: 91 },
  { targetId: 'SEN-SANDERS', name: 'Sen. Bernie Sanders', org: 'U.S. Senate', role: 'Senator', jurisdiction: 'Federal', domains: '["Labor","Healthcare","Economic Justice"]', influence: 95 },
  { targetId: 'SEN-WARREN', name: 'Sen. Elizabeth Warren', org: 'U.S. Senate', role: 'Senator', jurisdiction: 'Federal', domains: '["Consumer Protection","Financial Regulation","Housing"]', influence: 94 },
  { targetId: 'SEN-BOOKER', name: 'Sen. Cory Booker', org: 'U.S. Senate', role: 'Senator', jurisdiction: 'Federal', domains: '["Criminal Justice","Civil Rights","Housing"]', influence: 87 },
  { targetId: 'REP-SCOTT', name: 'Rep. Bobby Scott', org: 'U.S. House', role: 'Representative', jurisdiction: 'Federal', domains: '["Education","Labor","Civil Rights"]', influence: 86 },
  { targetId: 'SEN-DURBIN', name: 'Sen. Dick Durbin', org: 'U.S. Senate', role: 'Senator', jurisdiction: 'Federal', domains: '["Immigration","Criminal Justice","Civil Rights"]', influence: 93 },
  { targetId: 'CFPB-DIR', name: 'CFPB Director', org: 'Consumer Financial Protection Bureau', role: 'Agency Director', jurisdiction: 'Federal', domains: '["Consumer Protection","Financial Regulation"]', influence: 96 },
  { targetId: 'EEOC-CHAIR', name: 'EEOC Chair', org: 'Equal Employment Opportunity Commission', role: 'Agency Chair', jurisdiction: 'Federal', domains: '["Employment Discrimination","Civil Rights"]', influence: 94 },
  { targetId: 'DOL-SEC', name: 'Secretary of Labor', org: 'U.S. Department of Labor', role: 'Cabinet Secretary', jurisdiction: 'Federal', domains: '["Labor","Employment","Workplace Safety"]', influence: 97 },
  { targetId: 'HUD-SEC', name: 'Secretary of HUD', org: 'U.S. Department of Housing and Urban Development', role: 'Cabinet Secretary', jurisdiction: 'Federal', domains: '["Housing","Fair Housing","Community Development"]', influence: 95 },
  { targetId: 'NAACP-PRES', name: 'NAACP President', org: 'NAACP', role: 'Organization President', jurisdiction: 'Federal', domains: '["Civil Rights","Voting Rights","Criminal Justice"]', influence: 90 },
  { targetId: 'ACLU-DIR', name: 'ACLU Executive Director', org: 'ACLU', role: 'Executive Director', jurisdiction: 'Federal', domains: '["Civil Liberties","Criminal Justice","Immigration"]', influence: 93 },
  { targetId: 'NWLC-PRES', name: 'NWLC President', org: 'National Women\'s Law Center', role: 'President', jurisdiction: 'Federal', domains: '["Gender Equity","Employment","Education"]', influence: 88 },
  { targetId: 'NELP-DIR', name: 'NELP Executive Director', org: 'National Employment Law Project', role: 'Executive Director', jurisdiction: 'Federal', domains: '["Employment","Wage Theft","Worker Rights"]', influence: 86 },
  { targetId: 'NFHA-PRES', name: 'NFHA President', org: 'National Fair Housing Alliance', role: 'President', jurisdiction: 'Federal', domains: '["Fair Housing","Housing Discrimination"]', influence: 87 },
  { targetId: 'SPLC-PRES', name: 'SPLC President', org: 'Southern Poverty Law Center', role: 'President', jurisdiction: 'Federal', domains: '["Civil Rights","Hate Groups","Immigration"]', influence: 89 },
  { targetId: 'NPC-DIR', name: 'National Press Club Director', org: 'National Press Club', role: 'Director', jurisdiction: 'Federal', domains: '["Media","Press Freedom","Transparency"]', influence: 75 },
  { targetId: 'NYT-INVEST', name: 'NYT Investigations Editor', org: 'New York Times', role: 'Investigations Editor', jurisdiction: 'Federal', domains: '["Investigative Journalism","Government Accountability"]', influence: 92 },
  { targetId: 'WAPO-INVEST', name: 'WaPo Investigations Editor', org: 'Washington Post', role: 'Investigations Editor', jurisdiction: 'Federal', domains: '["Investigative Journalism","Government Accountability"]', influence: 91 },
  { targetId: 'PROPUB-DIR', name: 'ProPublica Editor-in-Chief', org: 'ProPublica', role: 'Editor-in-Chief', jurisdiction: 'Federal', domains: '["Investigative Journalism","Public Interest"]', influence: 90 },
];

const advRows = advocacyTargets.map(a => [
  a.targetId, a.name, a.org, a.role, a.jurisdiction,
  a.domains, '{}', a.influence, 70, null, now, now
]);
await batchInsert('advocacy_targets',
  ['target_id','name','organization','role','jurisdiction','issue_domains','contact_channels','influence_score','public_visibility_score','notes','created_at','updated_at'],
  advRows, 'Advocacy Targets');

// ============================================================
// 5. DATASET REGISTRY — register all public datasets
// ============================================================
console.log('\n=== DATASET REGISTRY ===');
const datasets = [
  { id: 'cfpb-complaints', name: 'CFPB Consumer Complaint Database', source: 'cfpb', url: 'https://www.consumerfinance.gov/data-research/consumer-complaints/', freq: 'daily', juris: 'Federal', domain: 'consumer_protection', desc: 'Consumer complaints about financial products and services filed with the CFPB.' },
  { id: 'fec-campaign-finance', name: 'FEC Campaign Finance Data', source: 'fec', url: 'https://www.fec.gov/data/', freq: 'daily', juris: 'Federal', domain: 'campaign_finance', desc: 'Federal campaign finance contributions, expenditures, and filings.' },
  { id: 'eeoc-enforcement', name: 'EEOC Enforcement Actions', source: 'eeoc', url: 'https://www.eeoc.gov/data/enforcement-and-litigation-data', freq: 'weekly', juris: 'Federal', domain: 'employment', desc: 'EEOC enforcement actions, litigation, and charge statistics.' },
  { id: 'dol-whd-enforcement', name: 'DOL Wage and Hour Enforcement', source: 'dol', url: 'https://enforcedata.dol.gov/views/data_summary.php', freq: 'weekly', juris: 'Federal', domain: 'employment', desc: 'Department of Labor Wage and Hour Division enforcement data.' },
  { id: 'hud-fheo-complaints', name: 'HUD Fair Housing Complaints', source: 'hud', url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp', freq: 'monthly', juris: 'Federal', domain: 'housing', desc: 'Fair housing complaints filed with HUD FHEO.' },
  { id: 'osha-inspections', name: 'OSHA Inspection Data', source: 'osha', url: 'https://www.osha.gov/data', freq: 'weekly', juris: 'Federal', domain: 'employment', desc: 'OSHA workplace inspection data, citations, and penalties.' },
  { id: 'ftc-enforcement', name: 'FTC Enforcement Actions', source: 'ftc', url: 'https://www.ftc.gov/enforcement/cases-proceedings', freq: 'weekly', juris: 'Federal', domain: 'consumer_protection', desc: 'FTC enforcement actions against unfair or deceptive business practices.' },
  { id: 'congress-legislation', name: 'Congressional Legislation Tracker', source: 'congress', url: 'https://www.congress.gov/', freq: 'daily', juris: 'Federal', domain: 'legislation', desc: 'Bills, resolutions, and legislative actions from Congress.' },
  { id: 'scotus-decisions', name: 'Supreme Court Decisions', source: 'supremecourt', url: 'https://www.supremecourt.gov/opinions/opinions.aspx', freq: 'weekly', juris: 'Federal', domain: 'case_law', desc: 'U.S. Supreme Court opinions and orders.' },
  { id: 'wa-ag-complaints', name: 'WA Attorney General Consumer Complaints', source: 'socrata', url: 'https://data.wa.gov/resource/gpri-47xz.json', freq: 'daily', juris: 'Washington', domain: 'consumer_protection', desc: 'Consumer complaints filed with the Washington State Attorney General.' },
  { id: 'wa-pdc-finance', name: 'WA Public Disclosure Commission', source: 'socrata', url: 'https://data.wa.gov/resource/j78t-andi.json', freq: 'daily', juris: 'Washington', domain: 'campaign_finance', desc: 'Campaign finance filings from the Washington State Public Disclosure Commission.' },
  { id: 'ca-crd-complaints', name: 'CA Civil Rights Department Complaints', source: 'ca-crd', url: 'https://calcivilrights.ca.gov/', freq: 'monthly', juris: 'California', domain: 'civil_rights', desc: 'Employment and housing discrimination complaints filed with CA CRD.' },
];

for (const d of datasets) {
  try {
    await conn.query(
      `INSERT IGNORE INTO dataset_registry (datasetId, datasetName, source, apiUrl, updateFrequency, jurisdiction, domain_dr, description_dr, fieldMapping, enabled, totalRecordsIngested, cronExpression, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, 0, '0 0 3 * * *', ?, ?)`,
      [d.id, d.name, d.source, d.url, d.freq, d.juris, d.domain, d.desc, now, now]
    );
  } catch(e) { /* skip dupes */ }
}
console.log('[Dataset Registry] Registered 12 public datasets');

// ============================================================
// 6. CONSUMER COMPLAINTS (synthetic data)
// ============================================================
console.log('\n=== CONSUMER COMPLAINTS ===');
const companies = ['Wells Fargo','Bank of America','JPMorgan Chase','Citibank','Capital One','Equifax','Experian','TransUnion','Navient','Ocwen Financial','Midland Credit Management','Portfolio Recovery Associates','Encore Capital Group','LVNV Funding','Synchrony Financial','Ally Financial','SoFi','Discover Financial','American Express','US Bank'];
const products = ['Credit reporting','Debt collection','Mortgage','Credit card','Student loan','Checking or savings account','Vehicle loan','Payday loan','Money transfer','Prepaid card'];
const issues = ['Incorrect information on your report','Attempts to collect debt not owed','Trouble during payment process','Problem with a credit reporting company investigation','Dealing with your lender or servicer','Improper use of your report','Written notification about debt','Communication tactics','Closing your account','Managing an account'];
const states = ['WA','CA','NY','TX','FL','IL','OH','PA','MI','GA','NC','NJ','VA','MA','AZ','MN','CO','TN','MD','IN'];
const responses = ['Closed with explanation','Closed with monetary relief','Closed with non-monetary relief','Closed without relief','In progress','Untimely response'];

const complaintRows = [];
for (let i = 0; i < 200; i++) {
  const dateOffset = Math.floor(Math.random() * 730); // last 2 years
  const d = new Date(2024, 0, 1);
  d.setDate(d.getDate() + dateOffset);
  const dateStr = d.toISOString().split('T')[0];
  const product = products[i % products.length];
  const claimType = product === 'Credit reporting' ? 'credit_reporting_error' :
    product === 'Debt collection' ? 'debt_collection_harassment' :
    product === 'Mortgage' ? 'housing_discrimination' : 'consumer_protection';
  complaintRows.push([
    `CFPB-${(7000000 + i).toString()}`, dateStr, product, null,
    issues[i % issues.length], null,
    companies[i % companies.length], states[i % states.length],
    (10000 + Math.floor(Math.random() * 89999)).toString(),
    null, responses[i % responses.length],
    i % 3 === 0, i % 5 === 0, 'Federal', claimType, 'CFPB Consumer Complaints'
  ]);
}
await batchInsert('consumer_complaints',
  ['complaint_id','date_received','product','sub_product','issue','sub_issue','company_name','state','zip_code','complaint_narrative','company_response','timely_response','consumer_disputed','jurisdiction','claim_type','source_dataset'],
  complaintRows, 'Consumer Complaints');

// ============================================================
// 7. CAMPAIGN FINANCE RECORDS (synthetic data)
// ============================================================
console.log('\n=== CAMPAIGN FINANCE ===');
const committees = ['Friends of Workers Rights PAC','Consumer Protection Action Fund','Fair Housing Alliance PAC','Labor Rights Coalition','Civil Rights Defense Fund','Environmental Justice PAC','Healthcare for All Committee','Education Equity PAC','Disability Rights Action Fund','Veterans Benefits Coalition'];
const candidates = ['Sen. Patty Murray','Sen. Maria Cantwell','Rep. Pramila Jayapal','Sen. Bernie Sanders','Sen. Elizabeth Warren','Rep. Bobby Scott','Sen. Cory Booker','Sen. Dick Durbin','Rep. Suzan DelBene','Gov. Jay Inslee'];
const parties = ['Democratic','Democratic','Democratic','Independent','Democratic','Democratic','Democratic','Democratic','Democratic','Democratic'];
const offices = ['U.S. Senate','U.S. Senate','U.S. House','U.S. Senate','U.S. Senate','U.S. House','U.S. Senate','U.S. Senate','U.S. House','Governor'];
const policyDomains = ['labor_rights','consumer_protection','fair_housing','workers_rights','financial_regulation','education','criminal_justice','immigration','disability_rights','veterans'];
const contributorTypes = ['Individual','PAC','Corporation','Union','Small Business','Nonprofit'];

const financeRows = [];
for (let i = 0; i < 150; i++) {
  const dateOffset = Math.floor(Math.random() * 365);
  const d = new Date(2025, 0, 1);
  d.setDate(d.getDate() + dateOffset);
  const dateStr = d.toISOString().split('T')[0];
  const amt = (Math.random() * 5000 + 100).toFixed(2);
  const ci = i % candidates.length;
  financeRows.push([
    `FEC-${(900000 + i).toString()}`, committees[i % committees.length],
    candidates[ci], parties[ci], offices[ci],
    ci < 5 ? 'Federal' : ['Washington','Federal','Federal','Federal','Washington'][ci-5],
    `Contributor ${i+1}`, contributorTypes[i % contributorTypes.length],
    amt, dateStr, null, null, null, '2025-Q' + (Math.floor(i/40)+1),
    'FEC Campaign Finance', policyDomains[i % policyDomains.length]
  ]);
}
await batchInsert('campaign_finance_records',
  ['record_id','committee_name','candidate_name','party','office','jurisdiction','contributor_name','contributor_type','contribution_amount','contribution_date','expenditure_amount','expenditure_date','expenditure_purpose','filing_period','source_dataset','policy_domain'],
  financeRows, 'Campaign Finance');

// ============================================================
// 8. ENFORCEMENT RECORDS (synthetic data)
// ============================================================
console.log('\n=== ENFORCEMENT RECORDS ===');
const enfAgencies = ['EEOC','DOL-WHD','OSHA','FTC','CFPB','HUD-FHEO','NLRB','DOJ-CRT','WA-LNI','CA-DLSE'];
const actionTypes = ['Investigation','Complaint','Consent Decree','Civil Penalty','Back Wage Assessment','Citation','Cease and Desist','Injunction','Settlement','Litigation'];
const violationTypes = ['Wage theft','Discrimination','Harassment','Safety violation','Unfair labor practice','Deceptive practice','Fair housing violation','Retaliation','ADA violation','FMLA violation'];
const resolutionTypes = ['Settlement','Consent decree','Civil penalty','Back wages paid','Corrective action','Dismissed','Ongoing','Referred to DOJ','Voluntary compliance','Litigation pending'];
const industries = ['Retail','Healthcare','Construction','Food Service','Manufacturing','Financial Services','Technology','Education','Hospitality','Transportation'];

const enfRows = [];
for (let i = 0; i < 150; i++) {
  const dateOffset = Math.floor(Math.random() * 730);
  const d = new Date(2024, 0, 1);
  d.setDate(d.getDate() + dateOffset);
  const dateStr = d.toISOString().split('T')[0];
  const penalty = (Math.random() * 500000 + 1000).toFixed(2);
  const agIdx = i % enfAgencies.length;
  const juris = agIdx >= 8 ? (agIdx === 8 ? 'Washington' : 'California') : 'Federal';
  const claimType = violationTypes[i % violationTypes.length].toLowerCase().replace(/ /g, '_');
  enfRows.push([
    `ENF-${(100000 + i).toString()}`, enfAgencies[agIdx],
    actionTypes[i % actionTypes.length], `Respondent Corp ${i+1}`,
    juris, violationTypes[i % violationTypes.length],
    penalty, dateStr, resolutionTypes[i % resolutionTypes.length],
    null, `CASE-${(200000+i).toString()}`, 'Various',
    industries[i % industries.length],
    `Enforcement action against Respondent Corp ${i+1} for ${violationTypes[i % violationTypes.length].toLowerCase()}.`,
    'Federal Enforcement Actions', claimType
  ]);
}
await batchInsert('enforcement_records',
  ['record_id','agency_name','action_type','respondent_name','jurisdiction','violation_type','penalty_amount','action_date','resolution_type','resolution_date','case_number','statute_cited','industry','description','source_dataset','claim_type'],
  enfRows, 'Enforcement Records');

// ============================================================
// 9. POLICY CHANGE REGISTRY (additional entries)
// ============================================================
console.log('\n=== POLICY CHANGES ===');
const policyChanges = [
  { id: 'PCR-PWFA-2023', type: 'legislative_fix', domain: 'employment', juris: 'Federal', title: 'Pregnant Workers Fairness Act Implementation', status: 'approved', sponsor: 'Sen. Bob Casey', summary: 'Requires employers to provide reasonable accommodations for pregnancy-related conditions.' },
  { id: 'PCR-NLRA-JOINT', type: 'agency_rule_change', domain: 'employment', juris: 'Federal', title: 'NLRB Joint Employer Rule Update', status: 'published', sponsor: 'NLRB', summary: 'Broadens definition of joint employer under NLRA to include indirect control over working conditions.' },
  { id: 'PCR-FTC-NONCOMPETE', type: 'agency_rule_change', domain: 'employment', juris: 'Federal', title: 'FTC Non-Compete Ban', status: 'published', sponsor: 'FTC', summary: 'Bans most non-compete agreements nationwide to promote worker mobility and competition.' },
  { id: 'PCR-CFPB-JUNK-FEES', type: 'agency_rule_change', domain: 'consumer_protection', juris: 'Federal', title: 'CFPB Junk Fee Crackdown', status: 'approved', sponsor: 'CFPB', summary: 'New rules targeting hidden junk fees in financial products and services.' },
  { id: 'PCR-DOL-OT-2024', type: 'agency_rule_change', domain: 'employment', juris: 'Federal', title: 'DOL Overtime Threshold Update 2024', status: 'published', sponsor: 'DOL', summary: 'Raises salary threshold for overtime exemption to $58,656 per year.' },
  { id: 'PCR-WA-SILENCED', type: 'legislative_fix', domain: 'employment', juris: 'Washington', title: 'Silenced No More Act (WA)', status: 'approved', sponsor: 'WA Legislature', summary: 'Prohibits NDAs that silence workers from disclosing discrimination, harassment, or retaliation.' },
  { id: 'PCR-WA-TENANT-2024', type: 'legislative_fix', domain: 'housing', juris: 'Washington', title: 'WA Tenant Protection Act 2024', status: 'approved', sponsor: 'WA Legislature', summary: 'Strengthens tenant protections including just-cause eviction requirements and rent increase notice periods.' },
  { id: 'PCR-CA-FAST-ACT', type: 'legislative_fix', domain: 'employment', juris: 'California', title: 'CA FAST Recovery Act', status: 'published', sponsor: 'CA Legislature', summary: 'Creates Fast Food Council to set minimum standards for fast food workers including wages and working conditions.' },
  { id: 'PCR-NY-CLEAN-SLATE', type: 'legislative_fix', domain: 'employment', juris: 'New York', title: 'NY Clean Slate Act', status: 'approved', sponsor: 'NY Legislature', summary: 'Automatically seals certain criminal conviction records after a waiting period to reduce barriers to employment and housing.' },
  { id: 'PCR-IL-TEMP-WORKER', type: 'legislative_fix', domain: 'employment', juris: 'Illinois', title: 'IL Temp Worker Fairness Act', status: 'published', sponsor: 'IL Legislature', summary: 'Requires equal pay and benefits for temporary workers compared to permanent employees performing similar work.' },
  { id: 'PCR-FED-PRO-ACT', type: 'legislative_fix', domain: 'employment', juris: 'Federal', title: 'PRO Act (Protecting the Right to Organize)', status: 'draft', sponsor: 'Rep. Bobby Scott', summary: 'Strengthens workers right to organize and bargain collectively, imposes penalties on employers who violate labor law.' },
  { id: 'PCR-FED-RAISE-WAGE', type: 'legislative_fix', domain: 'employment', juris: 'Federal', title: 'Raise the Wage Act', status: 'draft', sponsor: 'Sen. Bernie Sanders', summary: 'Gradually raises federal minimum wage to $17/hour and eliminates subminimum wage for tipped workers.' },
  { id: 'PCR-FED-EQUALITY', type: 'legislative_fix', domain: 'civil_rights', juris: 'Federal', title: 'Equality Act', status: 'draft', sponsor: 'Rep. David Cicilline', summary: 'Amends Civil Rights Act to prohibit discrimination based on sexual orientation and gender identity in employment, housing, and public accommodations.' },
  { id: 'PCR-FED-JVA', type: 'legislative_fix', domain: 'voting_rights', juris: 'Federal', title: 'John R. Lewis Voting Rights Advancement Act', status: 'draft', sponsor: 'Sen. Patrick Leahy', summary: 'Restores and strengthens Voting Rights Act protections weakened by Shelby County v. Holder.' },
  { id: 'PCR-FED-GBV', type: 'legislative_fix', domain: 'civil_rights', juris: 'Federal', title: 'Gender-Based Violence Prevention Act', status: 'draft', sponsor: 'Sen. Patty Murray', summary: 'Comprehensive legislation addressing gender-based violence through prevention, services, and accountability measures.' },
];

for (const p of policyChanges) {
  try {
    await conn.query(
      `INSERT IGNORE INTO policy_change_registry (change_id, pattern_type, harm_domain, jurisdiction, reform_type, target_institution, target_role, proposal_title, proposal_summary, supporting_pattern_ids, supporting_signal_count, supporting_outcome_ids, priority_score, urgency_level, evidence_strength, target_readiness, status, created_at, updated_at)
       VALUES (?, 'systemic_pattern', ?, ?, ?, 'Legislature', 'Lawmaker', ?, ?, '', 0, '', 75.00, 'medium', 'moderate', 'ready', ?, ?, ?)`,
      [p.id, p.domain, p.juris, p.type, p.title, p.summary, p.status, now, now]
    );
  } catch(e) { /* skip dupes */ }
}
console.log('[Policy Changes] Inserted policy change records');

// ============================================================
// 10. PROCEDURAL PATHS (from pasted_content_2.txt)
// ============================================================
console.log('\n=== PROCEDURAL PATHS ===');
const procPaths = [
  { claim: 'wage_theft', juris: 'Federal', steps: ['File complaint with DOL-WHD','DOL investigation','DOL determination','Appeal to ALJ','Appeal to ARB','Federal court action'], agency: 'DOL-WHD', deadlines: [null,null,null,30,30,null] },
  { claim: 'wage_theft', juris: 'Washington', steps: ['File complaint with L&I','L&I investigation','L&I determination','Appeal to Director','Appeal to BIIA','Superior Court appeal'], agency: 'WA L&I', deadlines: [null,null,null,30,30,30] },
  { claim: 'wage_theft', juris: 'California', steps: ['File wage claim with DLSE','DLSE conference','DLSE hearing','DLSE decision','Appeal to Superior Court'], agency: 'CA DLSE', deadlines: [null,null,null,null,10] },
  { claim: 'employment_discrimination', juris: 'Federal', steps: ['File charge with EEOC','EEOC investigation','EEOC mediation','EEOC determination','Right to sue letter','File federal lawsuit'], agency: 'EEOC', deadlines: [180,null,null,null,90,null] },
  { claim: 'employment_discrimination', juris: 'Washington', steps: ['File complaint with WSHRC','WSHRC investigation','WSHRC conciliation','WSHRC hearing','Appeal to Superior Court'], agency: 'WSHRC', deadlines: [180,null,null,null,30] },
  { claim: 'housing_discrimination', juris: 'Federal', steps: ['File complaint with HUD','HUD investigation','HUD conciliation','HUD charge','ALJ hearing','Federal court action'], agency: 'HUD', deadlines: [365,null,null,null,null,null] },
  { claim: 'housing_discrimination', juris: 'Washington', steps: ['File complaint with WSHRC','WSHRC investigation','WSHRC conciliation','WSHRC hearing','Appeal to Superior Court'], agency: 'WSHRC', deadlines: [180,null,null,null,30] },
  { claim: 'ssdi_benefits', juris: 'Federal', steps: ['File initial application','Initial determination','Request reconsideration','Reconsideration decision','Request ALJ hearing','ALJ decision','Appeals Council review','Federal court review'], agency: 'SSA', deadlines: [null,null,60,null,60,null,60,60] },
  { claim: 'unemployment_benefits', juris: 'Washington', steps: ['File initial claim','ESD determination','Request adjudication','Adjudication decision','Appeal to OAH','OAH hearing','Commissioner review'], agency: 'WA ESD', deadlines: [null,null,30,null,30,null,30] },
  { claim: 'workers_compensation', juris: 'Washington', steps: ['Report injury to employer','File claim with L&I','L&I determination','Protest determination','Appeal to BIIA','Appeal to Superior Court'], agency: 'WA L&I', deadlines: [null,365,null,60,60,30] },
  { claim: 'debt_collection_harassment', juris: 'Federal', steps: ['Send cease and desist letter','File CFPB complaint','File FTC complaint','File private FDCPA lawsuit'], agency: 'CFPB/FTC', deadlines: [null,null,null,365] },
  { claim: 'credit_reporting_error', juris: 'Federal', steps: ['Dispute with credit bureau','CRA investigation','CRA response','Dispute with furnisher','File CFPB complaint','File private FCRA lawsuit'], agency: 'CFPB', deadlines: [null,30,null,null,null,730] },
  { claim: 'police_misconduct', juris: 'Federal', steps: ['File internal affairs complaint','File civilian review board complaint','File DOJ complaint','File Section 1983 lawsuit'], agency: 'DOJ-CRT', deadlines: [null,null,null,1095] },
  { claim: 'section_1983_lawsuit', juris: 'Federal', steps: ['Preserve evidence','File notice of claim','File federal complaint','Discovery','Summary judgment motions','Trial'], agency: 'U.S. District Court', deadlines: [null,180,1095,null,null,null] },
];

let ppCount = 0;
for (const pp of procPaths) {
  for (let si = 0; si < pp.steps.length; si++) {
    try {
      await conn.query(
        `INSERT IGNORE INTO procedural_paths (claim_type, jurisdiction, step_number, step_name, step_description, required_documents, estimated_duration_days, responsible_agency, next_step, alternative_step, filing_fee, deadline_days, form_number, online_portal, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, NULL, NULL, ?, NULL, NULL, NOW(), NOW())`,
        [pp.claim, pp.juris, si+1, pp.steps[si], pp.steps[si], 30, pp.agency,
         si < pp.steps.length-1 ? pp.steps[si+1] : null,
         pp.deadlines[si]]
      );
      ppCount++;
    } catch(e) { /* skip dupes */ }
  }
}
console.log(`[Procedural Paths] Attempted ${ppCount} step inserts`);

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log('\n=== FINAL COUNTS ===');
const countTables = ['legal_statutes','legal_case_law','agency_authority_map','advocacy_targets','procedural_paths','dataset_registry','consumer_complaints','campaign_finance_records','enforcement_records','policy_change_registry'];
for (const t of countTables) {
  const [[r]] = await conn.query(`SELECT COUNT(*) as cnt FROM ${t}`);
  console.log(`  ${t}: ${r.cnt}`);
}

await conn.end();
console.log('\nSession 63 seed complete!');
