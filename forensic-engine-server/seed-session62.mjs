// Session 62 — Knowledge Backbone Data Ingestion
// Seeds data into all low-coverage tables to achieve ≥70% coverage
import mysql2 from 'mysql2/promise';

const conn = await mysql2.createConnection(process.env.DATABASE_URL);
const now = Date.now();

async function safeInsert(table, columns, values, label) {
  let inserted = 0;
  for (const row of values) {
    try {
      const placeholders = columns.map(() => '?').join(',');
      await conn.query(
        `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,
        row
      );
      inserted++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') continue;
      console.error(`  Error inserting into ${table}:`, e.message);
    }
  }
  console.log(`  ${label}: ${inserted}/${values.length} inserted`);
  return inserted;
}

console.log('=== Session 62: Knowledge Backbone Data Ingestion ===\n');

// ============================================================
// 1. LEGAL STATUTES — Need ~1200 more to hit target of 2000
// ============================================================
console.log('1. Seeding Legal Statutes...');

const statutes = [];
const startStatuteId = 200000;
let sid = startStatuteId;

// Federal employment statutes
const fedEmployment = [
  { jur: 'US', cit: '29 U.S.C. § 206', title: 'Fair Labor Standards Act - Minimum Wage', domains: ['employment','wage_theft'], summary: 'Establishes federal minimum wage requirements for covered employees.' },
  { jur: 'US', cit: '29 U.S.C. § 207', title: 'Fair Labor Standards Act - Overtime', domains: ['employment','wage_theft'], summary: 'Requires overtime pay at 1.5x regular rate for hours over 40 per week.' },
  { jur: 'US', cit: '29 U.S.C. § 211', title: 'FLSA - Recordkeeping Requirements', domains: ['employment'], summary: 'Requires employers to maintain accurate records of hours worked and wages paid.' },
  { jur: 'US', cit: '29 U.S.C. § 215', title: 'FLSA - Anti-Retaliation', domains: ['employment','retaliation'], summary: 'Prohibits retaliation against employees who file FLSA complaints.' },
  { jur: 'US', cit: '29 U.S.C. § 216(b)', title: 'FLSA - Private Right of Action', domains: ['employment','wage_theft'], summary: 'Provides employees right to sue for unpaid wages plus liquidated damages.' },
  { jur: 'US', cit: '42 U.S.C. § 2000e-2', title: 'Title VII - Unlawful Employment Practices', domains: ['employment','civil_rights'], summary: 'Prohibits discrimination based on race, color, religion, sex, or national origin.' },
  { jur: 'US', cit: '42 U.S.C. § 2000e-3', title: 'Title VII - Anti-Retaliation', domains: ['employment','retaliation'], summary: 'Prohibits retaliation against employees who oppose discriminatory practices.' },
  { jur: 'US', cit: '42 U.S.C. § 2000e-5', title: 'Title VII - Enforcement Procedures', domains: ['employment','civil_rights'], summary: 'Establishes EEOC charge filing requirements and timelines.' },
  { jur: 'US', cit: '42 U.S.C. § 12112', title: 'ADA - Discrimination in Employment', domains: ['employment','disability'], summary: 'Prohibits discrimination against qualified individuals with disabilities.' },
  { jur: 'US', cit: '42 U.S.C. § 12117', title: 'ADA - Enforcement', domains: ['employment','disability'], summary: 'Incorporates Title VII enforcement procedures for ADA claims.' },
  { jur: 'US', cit: '29 U.S.C. § 2612', title: 'FMLA - Leave Requirement', domains: ['employment','family'], summary: 'Entitles eligible employees to 12 weeks unpaid leave for qualifying reasons.' },
  { jur: 'US', cit: '29 U.S.C. § 2614', title: 'FMLA - Employment and Benefits Protection', domains: ['employment','family'], summary: 'Requires restoration to same or equivalent position after FMLA leave.' },
  { jur: 'US', cit: '29 U.S.C. § 2615', title: 'FMLA - Prohibited Acts', domains: ['employment','retaliation'], summary: 'Prohibits interference with or retaliation for exercising FMLA rights.' },
  { jur: 'US', cit: '29 U.S.C. § 158', title: 'NLRA - Unfair Labor Practices', domains: ['employment','labor'], summary: 'Defines unfair labor practices by employers and labor organizations.' },
  { jur: 'US', cit: '29 U.S.C. § 159', title: 'NLRA - Representatives and Elections', domains: ['employment','labor'], summary: 'Establishes procedures for union representation elections.' },
  { jur: 'US', cit: '29 U.S.C. § 1132', title: 'ERISA - Civil Enforcement', domains: ['employment','benefits'], summary: 'Provides civil enforcement mechanisms for employee benefit plan violations.' },
  { jur: 'US', cit: '29 U.S.C. § 1140', title: 'ERISA - Anti-Retaliation', domains: ['employment','benefits','retaliation'], summary: 'Prohibits retaliation against participants exercising ERISA rights.' },
  { jur: 'US', cit: '38 U.S.C. § 4311', title: 'USERRA - Nondiscrimination', domains: ['employment','veterans'], summary: 'Prohibits discrimination against persons who serve in the uniformed services.' },
  { jur: 'US', cit: '38 U.S.C. § 4312', title: 'USERRA - Reemployment Rights', domains: ['employment','veterans'], summary: 'Requires reemployment of returning service members in prior position.' },
  { jur: 'US', cit: '29 U.S.C. § 623', title: 'ADEA - Prohibition of Age Discrimination', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination against individuals 40 years or older.' },
];

// Federal housing statutes
const fedHousing = [
  { jur: 'US', cit: '42 U.S.C. § 3604', title: 'Fair Housing Act - Discriminatory Housing Practices', domains: ['housing','civil_rights'], summary: 'Prohibits discrimination in sale or rental of housing based on protected classes.' },
  { jur: 'US', cit: '42 U.S.C. § 3605', title: 'Fair Housing Act - Discriminatory Lending', domains: ['housing','consumer'], summary: 'Prohibits discrimination in residential real estate-related transactions.' },
  { jur: 'US', cit: '42 U.S.C. § 3617', title: 'Fair Housing Act - Interference and Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits interference, coercion, or intimidation related to fair housing rights.' },
  { jur: 'US', cit: '15 U.S.C. § 1691', title: 'Equal Credit Opportunity Act', domains: ['consumer','housing'], summary: 'Prohibits credit discrimination on basis of race, color, religion, national origin, sex, marital status, or age.' },
  { jur: 'US', cit: '12 U.S.C. § 2607', title: 'RESPA - Prohibition Against Kickbacks', domains: ['housing','consumer'], summary: 'Prohibits kickbacks and unearned fees in real estate settlement services.' },
  { jur: 'US', cit: '42 U.S.C. § 1437f', title: 'Section 8 Housing Choice Voucher Program', domains: ['housing','benefits'], summary: 'Authorizes rental assistance payments for low-income families.' },
  { jur: 'US', cit: '42 U.S.C. § 5301', title: 'Housing and Community Development Act', domains: ['housing','benefits'], summary: 'Establishes community development block grant program.' },
  { jur: 'US', cit: '15 U.S.C. § 1639c', title: 'Dodd-Frank - Ability to Repay', domains: ['housing','consumer'], summary: 'Requires creditors to make reasonable determination of ability to repay mortgage.' },
  { jur: 'US', cit: '11 U.S.C. § 362', title: 'Bankruptcy Code - Automatic Stay', domains: ['housing','consumer','bankruptcy'], summary: 'Imposes automatic stay on collection actions upon bankruptcy filing.' },
  { jur: 'US', cit: '12 U.S.C. § 2605', title: 'RESPA - Servicing Requirements', domains: ['housing','consumer'], summary: 'Establishes mortgage servicing requirements including error resolution.' },
];

// Federal consumer protection
const fedConsumer = [
  { jur: 'US', cit: '15 U.S.C. § 1692', title: 'Fair Debt Collection Practices Act', domains: ['consumer','debt_collection'], summary: 'Prohibits abusive, unfair, and deceptive debt collection practices.' },
  { jur: 'US', cit: '15 U.S.C. § 1692c', title: 'FDCPA - Communication Restrictions', domains: ['consumer','debt_collection'], summary: 'Restricts when, where, and how debt collectors may communicate with consumers.' },
  { jur: 'US', cit: '15 U.S.C. § 1692e', title: 'FDCPA - False Representations', domains: ['consumer','debt_collection'], summary: 'Prohibits false, deceptive, or misleading representations in debt collection.' },
  { jur: 'US', cit: '15 U.S.C. § 1692f', title: 'FDCPA - Unfair Practices', domains: ['consumer','debt_collection'], summary: 'Prohibits unfair practices in debt collection.' },
  { jur: 'US', cit: '15 U.S.C. § 1692g', title: 'FDCPA - Validation of Debts', domains: ['consumer','debt_collection'], summary: 'Requires debt collectors to provide written validation notice within 5 days.' },
  { jur: 'US', cit: '15 U.S.C. § 1681', title: 'Fair Credit Reporting Act', domains: ['consumer'], summary: 'Regulates collection, dissemination, and use of consumer credit information.' },
  { jur: 'US', cit: '15 U.S.C. § 1681s-2', title: 'FCRA - Furnisher Duties', domains: ['consumer'], summary: 'Imposes duties on furnishers of information to consumer reporting agencies.' },
  { jur: 'US', cit: '15 U.S.C. § 45', title: 'FTC Act - Unfair or Deceptive Acts', domains: ['consumer'], summary: 'Declares unfair or deceptive acts or practices in commerce unlawful.' },
  { jur: 'US', cit: '15 U.S.C. § 1601', title: 'Truth in Lending Act', domains: ['consumer','housing'], summary: 'Requires meaningful disclosure of credit terms to consumers.' },
  { jur: 'US', cit: '15 U.S.C. § 1635', title: 'TILA - Right of Rescission', domains: ['consumer','housing'], summary: 'Provides right to rescind certain credit transactions within 3 days.' },
  { jur: 'US', cit: '15 U.S.C. § 1679b', title: 'Credit Repair Organizations Act', domains: ['consumer'], summary: 'Prohibits deceptive practices by credit repair organizations.' },
  { jur: 'US', cit: '15 U.S.C. § 7701', title: 'CAN-SPAM Act', domains: ['consumer','technology'], summary: 'Establishes requirements for commercial email messages.' },
  { jur: 'US', cit: '47 U.S.C. § 227', title: 'Telephone Consumer Protection Act', domains: ['consumer','technology'], summary: 'Restricts telephone solicitations and use of automated equipment.' },
];

// Federal civil rights
const fedCivilRights = [
  { jur: 'US', cit: '42 U.S.C. § 1981', title: 'Civil Rights Act of 1866 - Equal Rights Under Law', domains: ['civil_rights'], summary: 'Guarantees equal rights to make and enforce contracts regardless of race.' },
  { jur: 'US', cit: '42 U.S.C. § 1982', title: 'Property Rights of Citizens', domains: ['civil_rights','housing'], summary: 'Guarantees equal property rights regardless of race.' },
  { jur: 'US', cit: '42 U.S.C. § 1983', title: 'Civil Action for Deprivation of Rights', domains: ['civil_rights','police_misconduct'], summary: 'Provides civil remedy for deprivation of constitutional rights under color of law.' },
  { jur: 'US', cit: '42 U.S.C. § 1985', title: 'Conspiracy to Interfere with Civil Rights', domains: ['civil_rights'], summary: 'Provides remedy for conspiracy to deprive persons of civil rights.' },
  { jur: 'US', cit: '42 U.S.C. § 1988', title: 'Attorney Fees in Civil Rights Cases', domains: ['civil_rights'], summary: 'Authorizes attorney fee awards to prevailing parties in civil rights cases.' },
  { jur: 'US', cit: '42 U.S.C. § 2000a', title: 'Title II - Public Accommodations', domains: ['civil_rights'], summary: 'Prohibits discrimination in places of public accommodation.' },
  { jur: 'US', cit: '42 U.S.C. § 2000d', title: 'Title VI - Federally Assisted Programs', domains: ['civil_rights'], summary: 'Prohibits discrimination under federally assisted programs on basis of race, color, or national origin.' },
  { jur: 'US', cit: '20 U.S.C. § 1681', title: 'Title IX - Education Amendments', domains: ['civil_rights','education'], summary: 'Prohibits sex-based discrimination in education programs receiving federal funding.' },
  { jur: 'US', cit: '42 U.S.C. § 12132', title: 'ADA Title II - Public Services', domains: ['disability','civil_rights'], summary: 'Prohibits disability discrimination by public entities.' },
  { jur: 'US', cit: '42 U.S.C. § 12182', title: 'ADA Title III - Public Accommodations', domains: ['disability','civil_rights'], summary: 'Prohibits disability discrimination in public accommodations.' },
  { jur: 'US', cit: '29 U.S.C. § 794', title: 'Rehabilitation Act Section 504', domains: ['disability','civil_rights'], summary: 'Prohibits disability discrimination in programs receiving federal financial assistance.' },
  { jur: 'US', cit: '8 U.S.C. § 1324b', title: 'Immigration - Unfair Employment Practices', domains: ['immigration','employment','civil_rights'], summary: 'Prohibits citizenship status and national origin discrimination in employment.' },
];

// Federal benefits
const fedBenefits = [
  { jur: 'US', cit: '42 U.S.C. § 405(g)', title: 'Social Security Act - Judicial Review', domains: ['benefits','disability'], summary: 'Provides for judicial review of final decisions of the Commissioner of Social Security.' },
  { jur: 'US', cit: '42 U.S.C. § 423', title: 'Social Security Disability Insurance', domains: ['benefits','disability'], summary: 'Establishes disability insurance benefit payments for insured individuals.' },
  { jur: 'US', cit: '42 U.S.C. § 1381', title: 'Supplemental Security Income', domains: ['benefits'], summary: 'Establishes SSI program for aged, blind, and disabled individuals.' },
  { jur: 'US', cit: '42 U.S.C. § 1395dd', title: 'EMTALA - Emergency Medical Treatment', domains: ['healthcare','benefits'], summary: 'Requires hospitals to provide emergency medical screening and stabilization.' },
  { jur: 'US', cit: '42 U.S.C. § 1396a', title: 'Medicaid - State Plans', domains: ['healthcare','benefits'], summary: 'Establishes requirements for state Medicaid plans.' },
  { jur: 'US', cit: '7 U.S.C. § 2011', title: 'SNAP - Food Stamp Program', domains: ['benefits'], summary: 'Establishes supplemental nutrition assistance program.' },
  { jur: 'US', cit: '42 U.S.C. § 601', title: 'TANF - Block Grants', domains: ['benefits','family'], summary: 'Establishes Temporary Assistance for Needy Families block grant program.' },
  { jur: 'US', cit: '42 U.S.C. § 9858', title: 'Child Care and Development Block Grant', domains: ['benefits','family'], summary: 'Provides child care assistance for low-income families.' },
  { jur: 'US', cit: '26 U.S.C. § 32', title: 'Earned Income Tax Credit', domains: ['benefits','tax'], summary: 'Provides refundable tax credit for low and moderate income workers.' },
  { jur: 'US', cit: '38 U.S.C. § 1110', title: 'Veterans Disability Compensation', domains: ['benefits','veterans','disability'], summary: 'Provides compensation for service-connected disabilities.' },
];

// State statutes - California
const caStatutes = [
  { jur: 'CA', cit: 'Cal. Lab. Code § 226', title: 'California Wage Statement Requirements', domains: ['employment','wage_theft'], summary: 'Requires employers to provide itemized wage statements each pay period.' },
  { jur: 'CA', cit: 'Cal. Lab. Code § 510', title: 'California Overtime Requirements', domains: ['employment','wage_theft'], summary: 'Requires overtime pay for work exceeding 8 hours per day or 40 hours per week.' },
  { jur: 'CA', cit: 'Cal. Lab. Code § 1102.5', title: 'California Whistleblower Protection', domains: ['employment','retaliation'], summary: 'Prohibits retaliation against employees who report violations of law.' },
  { jur: 'CA', cit: 'Cal. Gov. Code § 12940', title: 'FEHA - Unlawful Employment Practices', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics under California law.' },
  { jur: 'CA', cit: 'Cal. Gov. Code § 12955', title: 'FEHA - Housing Discrimination', domains: ['housing','civil_rights'], summary: 'Prohibits housing discrimination based on protected characteristics.' },
  { jur: 'CA', cit: 'Cal. Civ. Code § 1942.5', title: 'California Tenant Anti-Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits landlord retaliation against tenants who exercise legal rights.' },
  { jur: 'CA', cit: 'Cal. Civ. Code § 1950.5', title: 'California Security Deposit Law', domains: ['housing'], summary: 'Limits security deposits and requires itemized return within 21 days.' },
  { jur: 'CA', cit: 'Cal. Bus. & Prof. Code § 17200', title: 'California Unfair Competition Law', domains: ['consumer'], summary: 'Prohibits unlawful, unfair, or fraudulent business acts or practices.' },
  { jur: 'CA', cit: 'Cal. Civ. Code § 1770', title: 'California Consumer Legal Remedies Act', domains: ['consumer'], summary: 'Prohibits specified unfair methods of competition and deceptive acts.' },
  { jur: 'CA', cit: 'Cal. Lab. Code § 2802', title: 'California Employee Expense Reimbursement', domains: ['employment'], summary: 'Requires employers to reimburse employees for necessary business expenditures.' },
  { jur: 'CA', cit: 'Cal. Lab. Code § 98.6', title: 'California Labor Code Retaliation', domains: ['employment','retaliation'], summary: 'Prohibits retaliation for filing labor complaints or exercising labor rights.' },
  { jur: 'CA', cit: 'Cal. Lab. Code § 203', title: 'California Waiting Time Penalties', domains: ['employment','wage_theft'], summary: 'Imposes penalties for willful failure to pay wages upon termination.' },
];

// State statutes - Washington
const waStatutes = [
  { jur: 'WA', cit: 'RCW 49.46.130', title: 'Washington Overtime Pay', domains: ['employment','wage_theft'], summary: 'Requires overtime compensation at 1.5x regular rate.' },
  { jur: 'WA', cit: 'RCW 49.48.010', title: 'Washington Wage Payment Act', domains: ['employment','wage_theft'], summary: 'Requires payment of all wages due at established pay periods.' },
  { jur: 'WA', cit: 'RCW 49.60.180', title: 'Washington Law Against Discrimination - Employment', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected classes.' },
  { jur: 'WA', cit: 'RCW 49.60.222', title: 'Washington Law Against Discrimination - Housing', domains: ['housing','civil_rights'], summary: 'Prohibits housing discrimination based on protected classes.' },
  { jur: 'WA', cit: 'RCW 59.18.240', title: 'Washington Residential Landlord-Tenant Act - Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits landlord retaliation against tenants exercising legal rights.' },
  { jur: 'WA', cit: 'RCW 19.86.020', title: 'Washington Consumer Protection Act', domains: ['consumer'], summary: 'Declares unfair or deceptive acts or practices in trade or commerce unlawful.' },
  { jur: 'WA', cit: 'RCW 49.60.030', title: 'Washington Freedom from Discrimination', domains: ['civil_rights'], summary: 'Declares right to be free from discrimination a civil right.' },
  { jur: 'WA', cit: 'RCW 51.04.010', title: 'Washington Workers Compensation', domains: ['employment','benefits'], summary: 'Establishes industrial insurance system for workplace injuries.' },
  { jur: 'WA', cit: 'RCW 50.20.010', title: 'Washington Unemployment Benefits', domains: ['employment','benefits'], summary: 'Establishes eligibility requirements for unemployment compensation.' },
  { jur: 'WA', cit: 'RCW 49.78.020', title: 'Washington Family Leave Act', domains: ['employment','family'], summary: 'Provides family leave protections for eligible employees.' },
];

// State statutes - New York
const nyStatutes = [
  { jur: 'NY', cit: 'N.Y. Lab. Law § 191', title: 'New York Frequency of Pay', domains: ['employment','wage_theft'], summary: 'Requires timely payment of wages at specified intervals.' },
  { jur: 'NY', cit: 'N.Y. Lab. Law § 193', title: 'New York Deductions from Wages', domains: ['employment','wage_theft'], summary: 'Restricts permissible deductions from employee wages.' },
  { jur: 'NY', cit: 'N.Y. Lab. Law § 215', title: 'New York Labor Law Retaliation', domains: ['employment','retaliation'], summary: 'Prohibits retaliation for exercising rights under labor law.' },
  { jur: 'NY', cit: 'N.Y. Exec. Law § 296', title: 'New York Human Rights Law - Unlawful Practices', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'NY', cit: 'N.Y. Real Prop. Law § 227-a', title: 'New York Tenant Anti-Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits landlord retaliation against tenants who complain about conditions.' },
  { jur: 'NY', cit: 'N.Y. Gen. Bus. Law § 349', title: 'New York Deceptive Acts and Practices', domains: ['consumer'], summary: 'Prohibits deceptive acts or practices in conduct of business.' },
  { jur: 'NY', cit: 'N.Y. Gen. Bus. Law § 350', title: 'New York False Advertising', domains: ['consumer'], summary: 'Prohibits false advertising in conduct of business.' },
  { jur: 'NY', cit: 'N.Y. Lab. Law § 740', title: 'New York Whistleblower Protection', domains: ['employment','retaliation'], summary: 'Protects employees who disclose employer violations of law.' },
  { jur: 'NY', cit: 'N.Y. Workers Comp. Law § 10', title: 'New York Workers Compensation', domains: ['employment','benefits'], summary: 'Establishes compensation for workplace injuries and occupational diseases.' },
  { jur: 'NY', cit: 'N.Y. Lab. Law § 196-b', title: 'New York Paid Sick Leave', domains: ['employment','benefits'], summary: 'Requires employers to provide paid sick leave to employees.' },
];

// State statutes - Texas
const txStatutes = [
  { jur: 'TX', cit: 'Tex. Lab. Code § 21.051', title: 'Texas Commission on Human Rights Act - Discrimination', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
  { jur: 'TX', cit: 'Tex. Lab. Code § 61.011', title: 'Texas Payday Law', domains: ['employment','wage_theft'], summary: 'Requires timely payment of wages to employees.' },
  { jur: 'TX', cit: 'Tex. Prop. Code § 92.331', title: 'Texas Tenant Anti-Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits landlord retaliation against tenants who exercise legal rights.' },
  { jur: 'TX', cit: 'Tex. Bus. & Com. Code § 17.46', title: 'Texas Deceptive Trade Practices Act', domains: ['consumer'], summary: 'Prohibits false, misleading, or deceptive acts or practices in trade or commerce.' },
  { jur: 'TX', cit: 'Tex. Lab. Code § 451.001', title: 'Texas Workers Comp Retaliation', domains: ['employment','retaliation'], summary: 'Prohibits retaliation against employees who file workers compensation claims.' },
  { jur: 'TX', cit: 'Tex. Prop. Code § 92.104', title: 'Texas Security Deposit Return', domains: ['housing'], summary: 'Requires return of security deposit within 30 days of move-out.' },
  { jur: 'TX', cit: 'Tex. Prop. Code § 92.056', title: 'Texas Landlord Repair Obligations', domains: ['housing'], summary: 'Establishes landlord duty to repair conditions affecting health or safety.' },
  { jur: 'TX', cit: 'Tex. Lab. Code § 21.055', title: 'Texas Retaliation Protection', domains: ['employment','retaliation'], summary: 'Prohibits retaliation for opposing discriminatory practices.' },
];

// State statutes - Florida
const flStatutes = [
  { jur: 'FL', cit: 'Fla. Stat. § 760.10', title: 'Florida Civil Rights Act - Employment', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
  { jur: 'FL', cit: 'Fla. Stat. § 760.23', title: 'Florida Fair Housing Act', domains: ['housing','civil_rights'], summary: 'Prohibits housing discrimination based on protected characteristics.' },
  { jur: 'FL', cit: 'Fla. Stat. § 501.204', title: 'Florida Deceptive and Unfair Trade Practices Act', domains: ['consumer'], summary: 'Prohibits unfair or deceptive acts or practices in trade or commerce.' },
  { jur: 'FL', cit: 'Fla. Stat. § 83.64', title: 'Florida Tenant Anti-Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits landlord retaliation against tenants exercising legal rights.' },
  { jur: 'FL', cit: 'Fla. Stat. § 448.102', title: 'Florida Whistleblower Protection', domains: ['employment','retaliation'], summary: 'Protects private sector employees who report employer violations.' },
  { jur: 'FL', cit: 'Fla. Stat. § 83.49', title: 'Florida Security Deposit Law', domains: ['housing'], summary: 'Establishes requirements for handling tenant security deposits.' },
];

// State statutes - Illinois, Michigan, Minnesota, Oregon, Colorado
const otherStates = [
  { jur: 'IL', cit: '820 ILCS 105/4a', title: 'Illinois Minimum Wage Law', domains: ['employment','wage_theft'], summary: 'Establishes minimum wage requirements for Illinois employers.' },
  { jur: 'IL', cit: '775 ILCS 5/1-102', title: 'Illinois Human Rights Act', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'IL', cit: '815 ILCS 505/2', title: 'Illinois Consumer Fraud Act', domains: ['consumer'], summary: 'Prohibits unfair or deceptive acts or practices in trade or commerce.' },
  { jur: 'MI', cit: 'MCL 37.2202', title: 'Michigan Elliott-Larsen Civil Rights Act - Employment', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
  { jur: 'MI', cit: 'MCL 37.2502', title: 'Michigan Elliott-Larsen - Housing', domains: ['housing','civil_rights'], summary: 'Prohibits housing discrimination based on protected characteristics.' },
  { jur: 'MI', cit: 'MCL 445.903', title: 'Michigan Consumer Protection Act', domains: ['consumer'], summary: 'Prohibits unfair, unconscionable, or deceptive methods in trade or commerce.' },
  { jur: 'MN', cit: 'Minn. Stat. § 363A.08', title: 'Minnesota Human Rights Act - Employment', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected classes.' },
  { jur: 'MN', cit: 'Minn. Stat. § 363A.09', title: 'Minnesota Human Rights Act - Housing', domains: ['housing','civil_rights'], summary: 'Prohibits housing discrimination based on protected classes.' },
  { jur: 'MN', cit: 'Minn. Stat. § 325D.44', title: 'Minnesota Deceptive Trade Practices Act', domains: ['consumer'], summary: 'Prohibits deceptive trade practices.' },
  { jur: 'OR', cit: 'ORS 659A.030', title: 'Oregon Employment Discrimination', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected classes.' },
  { jur: 'OR', cit: 'ORS 90.385', title: 'Oregon Tenant Anti-Retaliation', domains: ['housing','retaliation'], summary: 'Prohibits landlord retaliation against tenants exercising legal rights.' },
  { jur: 'OR', cit: 'ORS 646.608', title: 'Oregon Unlawful Trade Practices', domains: ['consumer'], summary: 'Defines unlawful trade practices in Oregon.' },
  { jur: 'CO', cit: 'C.R.S. § 24-34-402', title: 'Colorado Anti-Discrimination Act - Employment', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
  { jur: 'CO', cit: 'C.R.S. § 24-34-502', title: 'Colorado Anti-Discrimination Act - Housing', domains: ['housing','civil_rights'], summary: 'Prohibits housing discrimination based on protected characteristics.' },
  { jur: 'CO', cit: 'C.R.S. § 6-1-105', title: 'Colorado Consumer Protection Act', domains: ['consumer'], summary: 'Prohibits deceptive trade practices in Colorado.' },
  { jur: 'NJ', cit: 'N.J.S.A. 10:5-12', title: 'New Jersey Law Against Discrimination', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'NJ', cit: 'N.J.S.A. 56:8-2', title: 'New Jersey Consumer Fraud Act', domains: ['consumer'], summary: 'Prohibits unconscionable commercial practices and deception.' },
  { jur: 'PA', cit: '43 P.S. § 955', title: 'Pennsylvania Human Relations Act', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'PA', cit: '73 P.S. § 201-3', title: 'Pennsylvania Unfair Trade Practices Act', domains: ['consumer'], summary: 'Prohibits unfair or deceptive acts or practices in trade or commerce.' },
  { jur: 'OH', cit: 'ORC § 4112.02', title: 'Ohio Civil Rights Act', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'GA', cit: 'O.C.G.A. § 10-1-393', title: 'Georgia Fair Business Practices Act', domains: ['consumer'], summary: 'Prohibits unfair or deceptive acts or practices in trade or commerce.' },
  { jur: 'MA', cit: 'M.G.L. c. 151B § 4', title: 'Massachusetts Anti-Discrimination Law', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'MA', cit: 'M.G.L. c. 93A § 2', title: 'Massachusetts Consumer Protection Act', domains: ['consumer'], summary: 'Prohibits unfair or deceptive acts or practices in trade or commerce.' },
  { jur: 'VA', cit: 'Va. Code § 2.2-3900', title: 'Virginia Human Rights Act', domains: ['employment','civil_rights','housing'], summary: 'Prohibits discrimination in employment, housing, and public accommodations.' },
  { jur: 'MD', cit: 'Md. Code, State Gov. § 20-606', title: 'Maryland Fair Employment Practices Act', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
  { jur: 'WI', cit: 'Wis. Stat. § 111.321', title: 'Wisconsin Fair Employment Act', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected classes.' },
  { jur: 'NC', cit: 'N.C.G.S. § 143-422.2', title: 'North Carolina Equal Employment Practices Act', domains: ['employment','civil_rights'], summary: 'Declares discriminatory employment practices against public policy.' },
  { jur: 'AZ', cit: 'A.R.S. § 41-1463', title: 'Arizona Civil Rights Act - Employment', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
  { jur: 'NV', cit: 'NRS 613.330', title: 'Nevada Employment Discrimination', domains: ['employment','civil_rights'], summary: 'Prohibits employment discrimination based on protected characteristics.' },
];

// Federal workplace safety and whistleblower
const fedSafety = [
  { jur: 'US', cit: '29 U.S.C. § 654', title: 'OSHA - Employer Duties', domains: ['employment','workplace_safety'], summary: 'Requires employers to furnish workplace free from recognized hazards.' },
  { jur: 'US', cit: '29 U.S.C. § 660(c)', title: 'OSHA - Anti-Retaliation', domains: ['employment','retaliation','workplace_safety'], summary: 'Prohibits retaliation against employees who exercise OSHA rights.' },
  { jur: 'US', cit: '18 U.S.C. § 1514A', title: 'Sarbanes-Oxley Whistleblower Protection', domains: ['employment','retaliation','securities'], summary: 'Protects employees of publicly traded companies who report fraud.' },
  { jur: 'US', cit: '31 U.S.C. § 3730', title: 'False Claims Act - Qui Tam', domains: ['employment','retaliation','government'], summary: 'Allows private persons to bring actions for false claims against the government.' },
  { jur: 'US', cit: '15 U.S.C. § 78u-6', title: 'Dodd-Frank Whistleblower Protection', domains: ['employment','retaliation','securities'], summary: 'Protects whistleblowers who report securities violations to SEC.' },
  { jur: 'US', cit: '42 U.S.C. § 7622', title: 'Clean Air Act - Employee Protection', domains: ['employment','retaliation','environment'], summary: 'Prohibits retaliation against employees who report environmental violations.' },
  { jur: 'US', cit: '33 U.S.C. § 1367', title: 'Clean Water Act - Employee Protection', domains: ['employment','retaliation','environment'], summary: 'Prohibits retaliation against employees who report water pollution violations.' },
  { jur: 'US', cit: '42 U.S.C. § 5851', title: 'Energy Reorganization Act - Employee Protection', domains: ['employment','retaliation','nuclear'], summary: 'Protects nuclear industry employees who report safety concerns.' },
];

const allStatutes = [...fedEmployment, ...fedHousing, ...fedConsumer, ...fedCivilRights, ...fedBenefits, ...caStatutes, ...waStatutes, ...nyStatutes, ...txStatutes, ...flStatutes, ...otherStates, ...fedSafety];

for (const s of allStatutes) {
  statutes.push([
    sid++, s.jur, s.cit, s.title, null, s.summary,
    JSON.stringify(s.domains), 'statute', null, null, null, null, null, null, null, now, now,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null
  ]);
}

const statuteCols = ['id','jurisdiction','citation','title','fullText','summary','domains','sourceType','keyRequirements','deadlines','effectiveDate','repealedDate','amendments','sourceUrl','addedBy','createdAt','updatedAt','keyProvisions','definitions','administrativeAgencies','actors','beneficiariesStructural','fundingMechanics','enforcementTriggers','loopholesAndGaps','impactScope','implementationSteps','comparativeExamples','publicSources','neutralSummaryCard','contactMap'];
await safeInsert('legal_statutes', statuteCols, statutes, 'Legal Statutes');

// ============================================================
// 2. LEGAL CASE LAW — Need ~700 more to hit target of 1000
// ============================================================
console.log('\n2. Seeding Legal Case Law...');

const caseLaw = [];
let cid = 100000;

const cases = [
  // Employment - Wage Theft
  { jur: 'US', cit: 'IBP, Inc. v. Alvarez, 546 U.S. 21 (2005)', name: 'IBP Inc. v. Alvarez', court: 'U.S. Supreme Court', year: 2005, domains: ['employment','wage_theft'], holding: 'Walking time between donning/doffing areas and production floor is compensable under FLSA.' },
  { jur: 'US', cit: 'Integrity Staffing Solutions v. Busk, 574 U.S. 27 (2014)', name: 'Integrity Staffing v. Busk', court: 'U.S. Supreme Court', year: 2014, domains: ['employment','wage_theft'], holding: 'Time spent in post-shift security screenings is not compensable under FLSA.' },
  { jur: 'US', cit: 'Encino Motorcars v. Navarro, 584 U.S. 79 (2018)', name: 'Encino Motorcars v. Navarro', court: 'U.S. Supreme Court', year: 2018, domains: ['employment','wage_theft'], holding: 'Service advisors at car dealerships are exempt from FLSA overtime requirements.' },
  { jur: 'US', cit: 'Tyson Foods v. Bouaphakeo, 577 U.S. 442 (2016)', name: 'Tyson Foods v. Bouaphakeo', court: 'U.S. Supreme Court', year: 2016, domains: ['employment','wage_theft'], holding: 'Statistical evidence may be used to prove FLSA violations in class actions.' },
  // Employment - Discrimination
  { jur: 'US', cit: 'McDonnell Douglas Corp. v. Green, 411 U.S. 792 (1973)', name: 'McDonnell Douglas v. Green', court: 'U.S. Supreme Court', year: 1973, domains: ['employment','civil_rights'], holding: 'Established burden-shifting framework for employment discrimination claims.' },
  { jur: 'US', cit: 'Texas Dept. of Community Affairs v. Burdine, 450 U.S. 248 (1981)', name: 'Texas Dept. v. Burdine', court: 'U.S. Supreme Court', year: 1981, domains: ['employment','civil_rights'], holding: 'Defendant need only articulate legitimate nondiscriminatory reason, not prove absence of discrimination.' },
  { jur: 'US', cit: 'St. Mary\'s Honor Center v. Hicks, 509 U.S. 502 (1993)', name: 'St. Mary\'s Honor Center v. Hicks', court: 'U.S. Supreme Court', year: 1993, domains: ['employment','civil_rights'], holding: 'Rejection of employer\'s proffered reason permits but does not compel finding of discrimination.' },
  { jur: 'US', cit: 'Reeves v. Sanderson Plumbing Products, 530 U.S. 133 (2000)', name: 'Reeves v. Sanderson Plumbing', court: 'U.S. Supreme Court', year: 2000, domains: ['employment','civil_rights'], holding: 'Prima facie case plus disbelief of employer\'s reason can suffice for discrimination finding.' },
  { jur: 'US', cit: 'Desert Palace v. Costa, 539 U.S. 90 (2003)', name: 'Desert Palace v. Costa', court: 'U.S. Supreme Court', year: 2003, domains: ['employment','civil_rights'], holding: 'Direct evidence not required for mixed-motive discrimination claims under Title VII.' },
  { jur: 'US', cit: 'Bostock v. Clayton County, 590 U.S. 644 (2020)', name: 'Bostock v. Clayton County', court: 'U.S. Supreme Court', year: 2020, domains: ['employment','civil_rights'], holding: 'Title VII prohibition on sex discrimination encompasses sexual orientation and gender identity.' },
  { jur: 'US', cit: 'Griggs v. Duke Power Co., 401 U.S. 424 (1971)', name: 'Griggs v. Duke Power', court: 'U.S. Supreme Court', year: 1971, domains: ['employment','civil_rights'], holding: 'Employment practices with disparate impact on protected groups violate Title VII unless business necessity shown.' },
  { jur: 'US', cit: 'Meritor Savings Bank v. Vinson, 477 U.S. 57 (1986)', name: 'Meritor Savings Bank v. Vinson', court: 'U.S. Supreme Court', year: 1986, domains: ['employment','civil_rights'], holding: 'Sexual harassment creating hostile work environment violates Title VII.' },
  { jur: 'US', cit: 'Burlington Industries v. Ellerth, 524 U.S. 742 (1998)', name: 'Burlington Industries v. Ellerth', court: 'U.S. Supreme Court', year: 1998, domains: ['employment','civil_rights'], holding: 'Employer vicariously liable for supervisor harassment; affirmative defense available.' },
  { jur: 'US', cit: 'Faragher v. City of Boca Raton, 524 U.S. 775 (1998)', name: 'Faragher v. City of Boca Raton', court: 'U.S. Supreme Court', year: 1998, domains: ['employment','civil_rights'], holding: 'Employer liable for supervisor harassment; must show reasonable care to prevent and correct.' },
  // Disability
  { jur: 'US', cit: 'Toyota Motor Mfg. v. Williams, 534 U.S. 184 (2002)', name: 'Toyota Motor v. Williams', court: 'U.S. Supreme Court', year: 2002, domains: ['employment','disability'], holding: 'ADA disability must substantially limit major life activities (later superseded by ADAAA).' },
  { jur: 'US', cit: 'US Airways v. Barnett, 535 U.S. 391 (2002)', name: 'US Airways v. Barnett', court: 'U.S. Supreme Court', year: 2002, domains: ['employment','disability'], holding: 'Reasonable accommodation under ADA ordinarily does not require violation of seniority system.' },
  { jur: 'US', cit: 'Olmstead v. L.C., 527 U.S. 581 (1999)', name: 'Olmstead v. L.C.', court: 'U.S. Supreme Court', year: 1999, domains: ['disability','civil_rights'], holding: 'Unjustified institutional isolation of persons with disabilities is discrimination under ADA.' },
  // FMLA
  { jur: 'US', cit: 'Ragsdale v. Wolverine World Wide, 535 U.S. 81 (2002)', name: 'Ragsdale v. Wolverine World Wide', court: 'U.S. Supreme Court', year: 2002, domains: ['employment','family'], holding: 'FMLA leave runs concurrently with employer-provided leave even without notice.' },
  // Housing
  { jur: 'US', cit: 'Texas Dept. of Housing v. Inclusive Communities Project, 576 U.S. 519 (2015)', name: 'Texas Dept. of Housing v. Inclusive Communities', court: 'U.S. Supreme Court', year: 2015, domains: ['housing','civil_rights'], holding: 'Disparate impact claims are cognizable under the Fair Housing Act.' },
  { jur: 'US', cit: 'Havens Realty Corp. v. Coleman, 455 U.S. 363 (1982)', name: 'Havens Realty v. Coleman', court: 'U.S. Supreme Court', year: 1982, domains: ['housing','civil_rights'], holding: 'Fair housing testers have standing to sue for discriminatory misrepresentation.' },
  { jur: 'US', cit: 'City of Edmonds v. Oxford House, 514 U.S. 725 (1995)', name: 'City of Edmonds v. Oxford House', court: 'U.S. Supreme Court', year: 1995, domains: ['housing','disability'], holding: 'Zoning maximum occupancy limits are not exempt from FHA reasonable accommodation requirement.' },
  // Consumer/Debt Collection
  { jur: 'US', cit: 'Jerman v. Carlisle, McNellie, Rini, Kramer & Ulrich, 559 U.S. 573 (2010)', name: 'Jerman v. Carlisle', court: 'U.S. Supreme Court', year: 2010, domains: ['consumer','debt_collection'], holding: 'Bona fide error defense under FDCPA does not apply to mistakes of law.' },
  { jur: 'US', cit: 'Heintz v. Jenkins, 514 U.S. 291 (1995)', name: 'Heintz v. Jenkins', court: 'U.S. Supreme Court', year: 1995, domains: ['consumer','debt_collection'], holding: 'FDCPA applies to attorneys who regularly engage in debt collection activity.' },
  { jur: 'US', cit: 'Spokeo v. Robins, 578 U.S. 330 (2016)', name: 'Spokeo v. Robins', court: 'U.S. Supreme Court', year: 2016, domains: ['consumer'], holding: 'Article III standing requires concrete injury, not merely statutory violation.' },
  // Civil Rights / Section 1983
  { jur: 'US', cit: 'Monroe v. Pape, 365 U.S. 167 (1961)', name: 'Monroe v. Pape', court: 'U.S. Supreme Court', year: 1961, domains: ['civil_rights','police_misconduct'], holding: 'Section 1983 provides remedy for constitutional violations by state actors.' },
  { jur: 'US', cit: 'Monell v. Dept. of Social Services, 436 U.S. 658 (1978)', name: 'Monell v. Dept. of Social Services', court: 'U.S. Supreme Court', year: 1978, domains: ['civil_rights'], holding: 'Municipalities can be sued under Section 1983 for policies causing constitutional violations.' },
  { jur: 'US', cit: 'Graham v. Connor, 490 U.S. 386 (1989)', name: 'Graham v. Connor', court: 'U.S. Supreme Court', year: 1989, domains: ['civil_rights','police_misconduct'], holding: 'Excessive force claims analyzed under Fourth Amendment objective reasonableness standard.' },
  { jur: 'US', cit: 'Tennessee v. Garner, 471 U.S. 1 (1985)', name: 'Tennessee v. Garner', court: 'U.S. Supreme Court', year: 1985, domains: ['civil_rights','police_misconduct'], holding: 'Deadly force to prevent escape of unarmed fleeing felon violates Fourth Amendment.' },
  { jur: 'US', cit: 'Harlow v. Fitzgerald, 457 U.S. 800 (1982)', name: 'Harlow v. Fitzgerald', court: 'U.S. Supreme Court', year: 1982, domains: ['civil_rights'], holding: 'Government officials performing discretionary functions have qualified immunity.' },
  // Benefits
  { jur: 'US', cit: 'Barnhart v. Thomas, 540 U.S. 20 (2003)', name: 'Barnhart v. Thomas', court: 'U.S. Supreme Court', year: 2003, domains: ['benefits','disability'], holding: 'SSA may determine disability at step four without identifying specific past work.' },
  { jur: 'US', cit: 'Cleveland v. Policy Management Systems Corp., 526 U.S. 795 (1999)', name: 'Cleveland v. Policy Management Systems', court: 'U.S. Supreme Court', year: 1999, domains: ['benefits','disability','employment'], holding: 'SSDI receipt does not automatically estop ADA employment discrimination claim.' },
  // Circuit Court cases
  { jur: 'US', cit: 'Laffey v. Northwest Airlines, 567 F.2d 429 (D.C. Cir. 1976)', name: 'Laffey v. Northwest Airlines', court: 'D.C. Circuit', year: 1976, domains: ['employment','civil_rights'], holding: 'Established matrix for reasonable attorney fee calculations in civil rights cases.' },
  { jur: 'US', cit: 'Chevron U.S.A. v. NRDC, 467 U.S. 837 (1984)', name: 'Chevron v. NRDC', court: 'U.S. Supreme Court', year: 1984, domains: ['administrative'], holding: 'Courts defer to reasonable agency interpretations of ambiguous statutes.' },
  { jur: 'US', cit: 'Auer v. Robbins, 519 U.S. 452 (1997)', name: 'Auer v. Robbins', court: 'U.S. Supreme Court', year: 1997, domains: ['administrative','employment'], holding: 'Courts defer to agency interpretation of its own ambiguous regulations.' },
];

// State court cases
const stateCases = [
  { jur: 'CA', cit: 'Brinker Restaurant Corp. v. Superior Court, 53 Cal.4th 1004 (2012)', name: 'Brinker Restaurant v. Superior Court', court: 'California Supreme Court', year: 2012, domains: ['employment','wage_theft'], holding: 'Employer must provide meal periods but need not ensure they are taken.' },
  { jur: 'CA', cit: 'Dynamex Operations West v. Superior Court, 4 Cal.5th 903 (2018)', name: 'Dynamex Operations v. Superior Court', court: 'California Supreme Court', year: 2018, domains: ['employment'], holding: 'Adopted ABC test for determining independent contractor vs. employee status.' },
  { jur: 'CA', cit: 'Iskanian v. CLS Transportation, 59 Cal.4th 348 (2014)', name: 'Iskanian v. CLS Transportation', court: 'California Supreme Court', year: 2014, domains: ['employment','wage_theft'], holding: 'PAGA representative claims cannot be waived by arbitration agreements.' },
  { jur: 'NY', cit: 'Gottlieb v. Sullivan & Cromwell, 203 A.D.2d 241 (1st Dept. 1994)', name: 'Gottlieb v. Sullivan & Cromwell', court: 'NY Appellate Division', year: 1994, domains: ['employment','civil_rights'], holding: 'New York Human Rights Law provides broader protections than federal Title VII.' },
  { jur: 'WA', cit: 'Hill v. BCTI Income Fund-I, 144 Wn.2d 172 (2001)', name: 'Hill v. BCTI Income Fund-I', court: 'Washington Supreme Court', year: 2001, domains: ['employment','civil_rights'], holding: 'Washington Law Against Discrimination provides broader protections than federal law.' },
  { jur: 'TX', cit: 'Waffle House v. Williams, 313 S.W.3d 796 (Tex. 2010)', name: 'Waffle House v. Williams', court: 'Texas Supreme Court', year: 2010, domains: ['employment','civil_rights'], holding: 'Texas Commission on Human Rights Act claims subject to same analysis as federal Title VII.' },
  { jur: 'IL', cit: 'Blount v. Stroud, 232 Ill.2d 302 (2009)', name: 'Blount v. Stroud', court: 'Illinois Supreme Court', year: 2009, domains: ['employment','civil_rights'], holding: 'Illinois Human Rights Act provides exclusive remedy for employment discrimination claims.' },
  { jur: 'FL', cit: 'Byrd v. Richardson-Greenshields Securities, 552 So.2d 1099 (Fla. 1989)', name: 'Byrd v. Richardson-Greenshields', court: 'Florida Supreme Court', year: 1989, domains: ['employment','civil_rights'], holding: 'Sexual harassment claim recognized under Florida Civil Rights Act.' },
];

const allCases = [...cases, ...stateCases];
for (const c of allCases) {
  caseLaw.push([
    cid++, c.jur, c.cit, c.name, c.court, c.year, c.holding,
    null, null, JSON.stringify(c.domains), null, null, null, now, now
  ]);
}

const caseLawCols = ['id','jurisdiction','citation','caseName','court','yearDecided','holding','keyQuotes','statutesInterpreted','domains','subsequentHistory','sourceUrl','addedBy','createdAt','updatedAt'];
await safeInsert('legal_case_law', caseLawCols, caseLaw, 'Legal Case Law');

// ============================================================
// 3. AGENCY AUTHORITY MAP — Need ~48 more to hit target of 200
// ============================================================
console.log('\n3. Seeding Agency Authority Map...');

const agencies = [];
let aid = 40000;

const agencyData = [
  { statute: 'Fair Labor Standards Act', agency: 'U.S. Department of Labor - Wage and Hour Division', short: 'DOL-WHD', domain: 'employment', complaints: ['wage_theft','overtime_violation','minimum_wage','child_labor'], authority: ['29 U.S.C. § 201 et seq.'], timeline: 180, pathway: 'File complaint online at dol.gov/agencies/whd/contact/complaints or call 1-866-487-9243', outcomes: ['back_wages','liquidated_damages','civil_penalties','injunction'] },
  { statute: 'Title VII of the Civil Rights Act', agency: 'Equal Employment Opportunity Commission', short: 'EEOC', domain: 'employment', complaints: ['race_discrimination','sex_discrimination','religious_discrimination','national_origin_discrimination','retaliation'], authority: ['42 U.S.C. § 2000e-5'], timeline: 180, pathway: 'File charge within 180 days (300 days in deferral states) via EEOC portal or local office', outcomes: ['conciliation','right_to_sue','back_pay','reinstatement','compensatory_damages'] },
  { statute: 'Americans with Disabilities Act', agency: 'Equal Employment Opportunity Commission', short: 'EEOC', domain: 'disability', complaints: ['disability_discrimination','failure_to_accommodate','medical_inquiry_violation'], authority: ['42 U.S.C. § 12117'], timeline: 180, pathway: 'File ADA charge through EEOC within 180/300 days', outcomes: ['reasonable_accommodation','back_pay','compensatory_damages','injunctive_relief'] },
  { statute: 'Fair Housing Act', agency: 'U.S. Department of Housing and Urban Development', short: 'HUD', domain: 'housing', complaints: ['housing_discrimination','lending_discrimination','reasonable_accommodation_denial'], authority: ['42 U.S.C. § 3610'], timeline: 365, pathway: 'File complaint with HUD within one year of discriminatory act', outcomes: ['conciliation','administrative_hearing','civil_penalty','injunction','damages'] },
  { statute: 'Fair Debt Collection Practices Act', agency: 'Consumer Financial Protection Bureau', short: 'CFPB', domain: 'consumer', complaints: ['debt_collection_harassment','false_representation','unfair_practices','validation_failure'], authority: ['15 U.S.C. § 1692 et seq.'], timeline: null, pathway: 'Submit complaint at consumerfinance.gov/complaint', outcomes: ['cease_collection','debt_validation','statutory_damages','attorney_fees'] },
  { statute: 'Fair Credit Reporting Act', agency: 'Consumer Financial Protection Bureau', short: 'CFPB', domain: 'consumer', complaints: ['credit_report_error','identity_theft','unauthorized_inquiry','furnisher_violation'], authority: ['15 U.S.C. § 1681 et seq.'], timeline: null, pathway: 'File dispute with CRA, then CFPB complaint if unresolved', outcomes: ['correction','statutory_damages','actual_damages','attorney_fees'] },
  { statute: 'Occupational Safety and Health Act', agency: 'Occupational Safety and Health Administration', short: 'OSHA', domain: 'workplace_safety', complaints: ['unsafe_conditions','retaliation','recordkeeping_violation','training_failure'], authority: ['29 U.S.C. § 651 et seq.'], timeline: 30, pathway: 'File complaint online, by phone, or in person at OSHA area office', outcomes: ['inspection','citation','penalty','abatement_order','reinstatement'] },
  { statute: 'National Labor Relations Act', agency: 'National Labor Relations Board', short: 'NLRB', domain: 'labor', complaints: ['unfair_labor_practice','union_interference','retaliation','bad_faith_bargaining'], authority: ['29 U.S.C. § 151 et seq.'], timeline: 180, pathway: 'File unfair labor practice charge at regional NLRB office within 6 months', outcomes: ['cease_and_desist','reinstatement','back_pay','bargaining_order'] },
  { statute: 'Social Security Act', agency: 'Social Security Administration', short: 'SSA', domain: 'benefits', complaints: ['disability_denial','benefit_calculation_error','overpayment_dispute','cessation_of_benefits'], authority: ['42 U.S.C. § 405'], timeline: 60, pathway: 'Request reconsideration within 60 days, then ALJ hearing, then Appeals Council', outcomes: ['benefit_award','back_benefits','continuing_disability_review','favorable_decision'] },
  { statute: 'Sarbanes-Oxley Act', agency: 'Securities and Exchange Commission', short: 'SEC', domain: 'securities', complaints: ['securities_fraud','whistleblower_retaliation','accounting_fraud','insider_trading'], authority: ['18 U.S.C. § 1514A','15 U.S.C. § 78u-6'], timeline: 180, pathway: 'File whistleblower complaint with OSHA within 180 days or SEC tip', outcomes: ['reinstatement','back_pay','compensatory_damages','whistleblower_award'] },
  { statute: 'Truth in Lending Act', agency: 'Consumer Financial Protection Bureau', short: 'CFPB', domain: 'consumer', complaints: ['disclosure_violation','rescission_denial','billing_error','rate_misrepresentation'], authority: ['15 U.S.C. § 1601 et seq.'], timeline: null, pathway: 'Submit complaint at consumerfinance.gov/complaint', outcomes: ['rescission','statutory_damages','actual_damages','attorney_fees'] },
  { statute: 'RESPA', agency: 'Consumer Financial Protection Bureau', short: 'CFPB', domain: 'housing', complaints: ['kickback','servicing_error','escrow_violation','transfer_notice_failure'], authority: ['12 U.S.C. § 2601 et seq.'], timeline: null, pathway: 'Submit complaint at consumerfinance.gov/complaint', outcomes: ['treble_damages','statutory_damages','actual_damages','attorney_fees'] },
  { statute: 'Age Discrimination in Employment Act', agency: 'Equal Employment Opportunity Commission', short: 'EEOC', domain: 'employment', complaints: ['age_discrimination','mandatory_retirement','age_based_harassment','disparate_impact'], authority: ['29 U.S.C. § 621 et seq.'], timeline: 180, pathway: 'File charge with EEOC within 180/300 days', outcomes: ['back_pay','liquidated_damages','reinstatement','front_pay'] },
  { statute: 'Family and Medical Leave Act', agency: 'U.S. Department of Labor - Wage and Hour Division', short: 'DOL-WHD', domain: 'employment', complaints: ['fmla_denial','fmla_retaliation','fmla_interference','restoration_failure'], authority: ['29 U.S.C. § 2601 et seq.'], timeline: 730, pathway: 'File complaint with DOL-WHD or private lawsuit within 2 years (3 years if willful)', outcomes: ['back_pay','liquidated_damages','reinstatement','benefits_restoration'] },
  { statute: 'ERISA', agency: 'U.S. Department of Labor - Employee Benefits Security Administration', short: 'DOL-EBSA', domain: 'benefits', complaints: ['benefit_denial','fiduciary_breach','plan_violation','retaliation'], authority: ['29 U.S.C. § 1001 et seq.'], timeline: null, pathway: 'File complaint with DOL-EBSA or private lawsuit in federal court', outcomes: ['benefit_recovery','fiduciary_removal','plan_reform','attorney_fees'] },
  { statute: 'USERRA', agency: 'U.S. Department of Labor - Veterans Employment and Training Service', short: 'DOL-VETS', domain: 'veterans', complaints: ['reemployment_denial','discrimination','benefit_denial','seniority_violation'], authority: ['38 U.S.C. § 4301 et seq.'], timeline: null, pathway: 'File complaint with DOL-VETS or refer to DOJ/OSC', outcomes: ['reemployment','back_pay','liquidated_damages','benefits_restoration'] },
  { statute: 'Equal Credit Opportunity Act', agency: 'Consumer Financial Protection Bureau', short: 'CFPB', domain: 'consumer', complaints: ['credit_discrimination','adverse_action_notice_failure','spousal_signature_requirement'], authority: ['15 U.S.C. § 1691 et seq.'], timeline: null, pathway: 'Submit complaint at consumerfinance.gov/complaint', outcomes: ['actual_damages','punitive_damages','injunctive_relief','attorney_fees'] },
  { statute: 'Telephone Consumer Protection Act', agency: 'Federal Communications Commission', short: 'FCC', domain: 'consumer', complaints: ['robocall','autodialer','prerecorded_message','do_not_call_violation'], authority: ['47 U.S.C. § 227'], timeline: null, pathway: 'File complaint with FCC or private lawsuit', outcomes: ['statutory_damages_500','treble_damages_1500','injunction'] },
  { statute: 'CAN-SPAM Act', agency: 'Federal Trade Commission', short: 'FTC', domain: 'consumer', complaints: ['commercial_email_violation','opt_out_failure','deceptive_header','misleading_subject'], authority: ['15 U.S.C. § 7701 et seq.'], timeline: null, pathway: 'Report to FTC at reportfraud.ftc.gov', outcomes: ['civil_penalty','injunction'] },
  { statute: 'Clean Air Act', agency: 'Environmental Protection Agency', short: 'EPA', domain: 'environment', complaints: ['emission_violation','permit_violation','whistleblower_retaliation'], authority: ['42 U.S.C. § 7401 et seq.'], timeline: 30, pathway: 'File whistleblower complaint with OSHA within 30 days', outcomes: ['reinstatement','back_pay','compensatory_damages','abatement'] },
];

for (const a of agencyData) {
  agencies.push([
    aid++, a.statute, a.agency, a.short, a.domain,
    JSON.stringify(a.complaints), JSON.stringify(a.authority),
    a.timeline, a.pathway, JSON.stringify(a.outcomes),
    null, null, now, now
  ]);
}

const agencyCols = ['id','statute','agency','agencyShort','domain','complaintTypes','statutoryAuthority','responseTimelineDays','complaintPathway','commonOutcomes','linkedWeakJoints','addedBy','createdAt','updatedAt'];
await safeInsert('agency_authority_map', agencyCols, agencies, 'Agency Authority Map');

// ============================================================
// 4. ASSEMBLY SECTION LIBRARY — Need ~76 more to hit target of 100
// ============================================================
console.log('\n4. Seeding Assembly Section Library...');

const sections = [];
let secId = 100;

const sectionData = [
  // Legal document sections
  { name: 'Statement of Facts', type: 'complaint', template: 'On or about {{date}}, {{plaintiff}} was employed by/resided at/contracted with {{defendant}}. During the relevant period, the following events occurred: {{facts}}', placeholders: ['date','plaintiff','defendant','facts'] },
  { name: 'Jurisdiction and Venue', type: 'complaint', template: 'This Court has jurisdiction pursuant to {{statute}}. Venue is proper in this district because {{venue_basis}}.', placeholders: ['statute','venue_basis'] },
  { name: 'Parties', type: 'complaint', template: '{{plaintiff_name}} is a {{plaintiff_description}} residing in {{plaintiff_location}}. {{defendant_name}} is a {{defendant_description}} located at {{defendant_location}}.', placeholders: ['plaintiff_name','plaintiff_description','plaintiff_location','defendant_name','defendant_description','defendant_location'] },
  { name: 'Cause of Action - Discrimination', type: 'complaint', template: '{{plaintiff}} is a member of a protected class based on {{protected_characteristic}}. {{plaintiff}} was qualified for {{position_or_benefit}}. {{plaintiff}} suffered {{adverse_action}}. Similarly situated individuals outside the protected class were treated more favorably.', placeholders: ['plaintiff','protected_characteristic','position_or_benefit','adverse_action'] },
  { name: 'Cause of Action - Retaliation', type: 'complaint', template: '{{plaintiff}} engaged in protected activity by {{protected_activity}}. {{defendant}} was aware of the protected activity. {{defendant}} took adverse action by {{adverse_action}}. There is a causal connection between the protected activity and the adverse action.', placeholders: ['plaintiff','defendant','protected_activity','adverse_action'] },
  { name: 'Cause of Action - Wage Theft', type: 'complaint', template: '{{defendant}} failed to pay {{plaintiff}} wages owed for {{period}} in violation of {{statute}}. The unpaid wages total approximately ${{amount}}. {{plaintiff}} is entitled to liquidated damages and attorney fees.', placeholders: ['defendant','plaintiff','period','statute','amount'] },
  { name: 'Cause of Action - Housing Discrimination', type: 'complaint', template: '{{defendant}} discriminated against {{plaintiff}} in {{housing_transaction}} based on {{protected_characteristic}} in violation of {{statute}}.', placeholders: ['defendant','plaintiff','housing_transaction','protected_characteristic','statute'] },
  { name: 'Cause of Action - FDCPA Violation', type: 'complaint', template: '{{defendant}} is a debt collector as defined by 15 U.S.C. § 1692a(6). {{defendant}} violated the FDCPA by {{violation_description}}. {{plaintiff}} is entitled to statutory damages up to $1,000 plus actual damages and attorney fees.', placeholders: ['defendant','violation_description','plaintiff'] },
  { name: 'Prayer for Relief', type: 'complaint', template: 'WHEREFORE, {{plaintiff}} respectfully requests that this Court: (a) Enter judgment in favor of {{plaintiff}}; (b) Award compensatory damages; (c) Award punitive damages; (d) Award attorney fees and costs; (e) Grant such other relief as the Court deems just and proper.', placeholders: ['plaintiff'] },
  { name: 'Demand for Jury Trial', type: 'complaint', template: '{{plaintiff}} hereby demands a trial by jury on all issues so triable.', placeholders: ['plaintiff'] },
  // Appeal sections
  { name: 'Statement of Issues', type: 'appeal', template: 'The following issues are presented for review: {{issues}}', placeholders: ['issues'] },
  { name: 'Standard of Review', type: 'appeal', template: 'The {{standard}} standard of review applies to this issue because {{reason}}.', placeholders: ['standard','reason'] },
  { name: 'Argument - Legal Error', type: 'appeal', template: 'The lower tribunal erred in {{error_description}}. The correct legal standard requires {{correct_standard}}. Under the correct standard, the evidence shows {{conclusion}}.', placeholders: ['error_description','correct_standard','conclusion'] },
  { name: 'Argument - Factual Error', type: 'appeal', template: 'The finding that {{finding}} is not supported by substantial evidence. The record shows {{contrary_evidence}}.', placeholders: ['finding','contrary_evidence'] },
  // Administrative sections
  { name: 'EEOC Charge Narrative', type: 'administrative', template: 'I was hired by {{employer}} on {{hire_date}} as a {{position}}. On or about {{incident_date}}, {{discrimination_description}}. I believe I was discriminated against because of my {{protected_class}} in violation of {{statute}}.', placeholders: ['employer','hire_date','position','incident_date','discrimination_description','protected_class','statute'] },
  { name: 'HUD Complaint Narrative', type: 'administrative', template: 'On {{date}}, I applied for/was residing at {{property}}. {{respondent}} discriminated against me by {{discriminatory_act}} because of my {{protected_class}}.', placeholders: ['date','property','respondent','discriminatory_act','protected_class'] },
  { name: 'OSHA Complaint Description', type: 'administrative', template: 'The following hazardous conditions exist at {{workplace}}: {{hazards}}. These conditions violate {{standard}}. {{employees_affected}} employees are exposed to these hazards.', placeholders: ['workplace','hazards','standard','employees_affected'] },
  { name: 'SSA Disability Function Report', type: 'administrative', template: 'My conditions ({{conditions}}) limit my ability to {{limitations}}. On a typical day, I {{daily_activities}}. I need assistance with {{assistance_needed}}.', placeholders: ['conditions','limitations','daily_activities','assistance_needed'] },
  // Letter sections
  { name: 'Demand Letter Opening', type: 'demand', template: 'This letter constitutes formal demand on behalf of {{client}} regarding {{matter}}. Unless the matters described herein are resolved within {{deadline_days}} days, {{client}} intends to pursue all available legal remedies.', placeholders: ['client','matter','deadline_days'] },
  { name: 'Demand Letter - Damages Calculation', type: 'demand', template: 'The damages sustained by {{client}} include: {{damages_list}}. The total damages amount to ${{total_amount}}.', placeholders: ['client','damages_list','total_amount'] },
  { name: 'Cease and Desist', type: 'demand', template: 'You are hereby directed to immediately cease and desist from {{prohibited_conduct}}. This conduct violates {{legal_basis}}. Failure to comply may result in {{consequences}}.', placeholders: ['prohibited_conduct','legal_basis','consequences'] },
  { name: 'FOIA Request Body', type: 'inquiry', template: 'Pursuant to the Freedom of Information Act, 5 U.S.C. § 552, I request access to the following records: {{records_description}}. The requested records pertain to {{subject}} during the period {{date_range}}.', placeholders: ['records_description','subject','date_range'] },
  // Reform package sections
  { name: 'Executive Summary', type: 'reform', template: 'This reform package addresses {{issue}} affecting {{population}} in {{jurisdiction}}. Analysis of {{evidence_count}} data points reveals {{key_finding}}. We recommend {{primary_recommendation}}.', placeholders: ['issue','population','jurisdiction','evidence_count','key_finding','primary_recommendation'] },
  { name: 'Evidence Summary', type: 'reform', template: 'The following evidence supports the need for reform: {{evidence_summary}}. This evidence was gathered from {{source_count}} sources across {{jurisdiction_count}} jurisdictions.', placeholders: ['evidence_summary','source_count','jurisdiction_count'] },
  { name: 'Root Cause Analysis', type: 'reform', template: 'The root cause of {{problem}} is {{root_cause}}. Contributing factors include: {{contributing_factors}}. The systemic nature of this issue is demonstrated by {{systemic_evidence}}.', placeholders: ['problem','root_cause','contributing_factors','systemic_evidence'] },
  { name: 'Policy Recommendation', type: 'reform', template: 'We recommend the following policy change: {{recommendation}}. This change would address {{problem}} by {{mechanism}}. Similar reforms in {{comparison_jurisdiction}} resulted in {{outcome}}.', placeholders: ['recommendation','problem','mechanism','comparison_jurisdiction','outcome'] },
  { name: 'Implementation Timeline', type: 'reform', template: 'Phase 1 ({{phase1_timeline}}): {{phase1_actions}}. Phase 2 ({{phase2_timeline}}): {{phase2_actions}}. Phase 3 ({{phase3_timeline}}): {{phase3_actions}}.', placeholders: ['phase1_timeline','phase1_actions','phase2_timeline','phase2_actions','phase3_timeline','phase3_actions'] },
  { name: 'Stakeholder Impact Assessment', type: 'reform', template: 'The proposed reform would impact the following stakeholders: {{stakeholders}}. Benefits include: {{benefits}}. Potential concerns: {{concerns}}. Mitigation strategies: {{mitigations}}.', placeholders: ['stakeholders','benefits','concerns','mitigations'] },
  // Investigation sections
  { name: 'Investigation Summary', type: 'investigation', template: 'Investigation into {{subject}} commenced on {{start_date}}. {{document_count}} documents were reviewed. {{witness_count}} witnesses were interviewed. Key findings: {{findings}}.', placeholders: ['subject','start_date','document_count','witness_count','findings'] },
  { name: 'Chronology of Events', type: 'investigation', template: 'The following chronology documents the relevant events: {{chronology}}', placeholders: ['chronology'] },
  { name: 'Evidence Inventory', type: 'investigation', template: 'The following evidence was collected and preserved: {{evidence_list}}. Chain of custody maintained by {{custodian}}.', placeholders: ['evidence_list','custodian'] },
  { name: 'Witness Statement Summary', type: 'investigation', template: '{{witness_name}} ({{witness_role}}) stated: {{statement_summary}}. This statement {{corroborates_or_contradicts}} {{related_evidence}}.', placeholders: ['witness_name','witness_role','statement_summary','corroborates_or_contradicts','related_evidence'] },
  // Compliance sections
  { name: 'Compliance Audit Findings', type: 'compliance', template: 'Audit of {{entity}} conducted on {{date}} revealed {{finding_count}} findings: {{findings}}. Severity: {{severity}}. Recommended corrective actions: {{actions}}.', placeholders: ['entity','date','finding_count','findings','severity','actions'] },
  { name: 'Corrective Action Plan', type: 'compliance', template: 'To address {{violation}}, the following corrective actions will be implemented: {{actions}}. Timeline: {{timeline}}. Responsible party: {{responsible_party}}. Verification method: {{verification}}.', placeholders: ['violation','actions','timeline','responsible_party','verification'] },
];

for (const s of sectionData) {
  sections.push([
    secId++, s.name, s.type, null, 0, s.template,
    JSON.stringify(s.placeholders), null, null, null, null, now
  ]);
}

const sectionCols = ['id','sectionName','sectionType','templateId','orderIndex','contentTemplate','placeholders','conditionalRules','legalStandards','exampleContent','notes','createdAt'];
await safeInsert('assembly_section_library', sectionCols, sections, 'Assembly Section Library');

// ============================================================
// 5. DEADLINE RULES — Need ~63 more to hit target of 100
// ============================================================
console.log('\n5. Seeding Deadline Rules...');

const deadlines = [];
let did = 200;

const deadlineData = [
  // Employment deadlines
  { claim: 'employment_discrimination', jur: 'US', trigger: 'Discriminatory act occurs', type: 'filing', days: 180, extended: 300, extCond: 'State has deferral agency (FEPA)', tolling: true, tollCond: ['equitable_tolling','continuing_violation'], authority: '42 U.S.C. § 2000e-5(e)' },
  { claim: 'employment_discrimination', jur: 'US', trigger: 'EEOC issues right-to-sue letter', type: 'filing', days: 90, extended: null, extCond: null, tolling: false, tollCond: null, authority: '42 U.S.C. § 2000e-5(f)(1)' },
  { claim: 'age_discrimination', jur: 'US', trigger: 'Discriminatory act occurs', type: 'filing', days: 180, extended: 300, extCond: 'State has deferral agency', tolling: true, tollCond: ['equitable_tolling'], authority: '29 U.S.C. § 626(d)' },
  { claim: 'disability_discrimination', jur: 'US', trigger: 'Discriminatory act occurs', type: 'filing', days: 180, extended: 300, extCond: 'State has deferral agency', tolling: true, tollCond: ['equitable_tolling','continuing_violation'], authority: '42 U.S.C. § 12117' },
  { claim: 'wage_theft', jur: 'US', trigger: 'Wage violation occurs', type: 'statute_of_limitations', days: 730, extended: 1095, extCond: 'Willful violation', tolling: true, tollCond: ['equitable_tolling','discovery_rule'], authority: '29 U.S.C. § 255' },
  { claim: 'fmla_retaliation', jur: 'US', trigger: 'Retaliatory act occurs', type: 'statute_of_limitations', days: 730, extended: 1095, extCond: 'Willful violation', tolling: false, tollCond: null, authority: '29 U.S.C. § 2617(c)' },
  { claim: 'osha_retaliation', jur: 'US', trigger: 'Retaliatory act occurs', type: 'filing', days: 30, extended: null, extCond: null, tolling: true, tollCond: ['equitable_tolling'], authority: '29 U.S.C. § 660(c)' },
  { claim: 'nlra_unfair_labor_practice', jur: 'US', trigger: 'Unfair labor practice occurs', type: 'filing', days: 180, extended: null, extCond: null, tolling: false, tollCond: null, authority: '29 U.S.C. § 160(b)' },
  { claim: 'sox_whistleblower', jur: 'US', trigger: 'Retaliatory act occurs', type: 'filing', days: 180, extended: null, extCond: null, tolling: true, tollCond: ['equitable_tolling'], authority: '18 U.S.C. § 1514A(b)(2)(D)' },
  { claim: 'erisa_benefit_denial', jur: 'US', trigger: 'Final benefit denial', type: 'administrative_exhaustion', days: 180, extended: null, extCond: null, tolling: false, tollCond: null, authority: '29 U.S.C. § 1133' },
  // Housing deadlines
  { claim: 'housing_discrimination', jur: 'US', trigger: 'Discriminatory act occurs', type: 'filing', days: 365, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation'], authority: '42 U.S.C. § 3610(a)(1)(A)' },
  { claim: 'housing_discrimination', jur: 'US', trigger: 'Discriminatory act occurs', type: 'statute_of_limitations', days: 730, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation','equitable_tolling'], authority: '42 U.S.C. § 3613(a)(1)(A)' },
  { claim: 'respa_violation', jur: 'US', trigger: 'Violation occurs', type: 'statute_of_limitations', days: 1095, extended: null, extCond: null, tolling: false, tollCond: null, authority: '12 U.S.C. § 2614' },
  { claim: 'tila_violation', jur: 'US', trigger: 'Violation occurs', type: 'statute_of_limitations', days: 365, extended: null, extCond: null, tolling: false, tollCond: null, authority: '15 U.S.C. § 1640(e)' },
  { claim: 'tila_rescission', jur: 'US', trigger: 'Loan consummation', type: 'filing', days: 3, extended: 1095, extCond: 'Material TILA disclosure violation', tolling: false, tollCond: null, authority: '15 U.S.C. § 1635' },
  // Consumer deadlines
  { claim: 'fdcpa_violation', jur: 'US', trigger: 'Violation occurs', type: 'statute_of_limitations', days: 365, extended: null, extCond: null, tolling: true, tollCond: ['equitable_tolling','discovery_rule'], authority: '15 U.S.C. § 1692k(d)' },
  { claim: 'fcra_violation', jur: 'US', trigger: 'Violation occurs', type: 'statute_of_limitations', days: 730, extended: null, extCond: null, tolling: true, tollCond: ['discovery_rule'], authority: '15 U.S.C. § 1681p' },
  { claim: 'tcpa_violation', jur: 'US', trigger: 'Violation occurs', type: 'statute_of_limitations', days: 1460, extended: null, extCond: null, tolling: false, tollCond: null, authority: '47 U.S.C. § 227' },
  // Civil rights deadlines
  { claim: 'civil_rights_1983', jur: 'US', trigger: 'Constitutional violation occurs', type: 'statute_of_limitations', days: 730, extended: 1095, extCond: 'Varies by state (borrows state personal injury SOL)', tolling: true, tollCond: ['equitable_tolling','discovery_rule','minority_tolling'], authority: '42 U.S.C. § 1983' },
  { claim: 'police_misconduct', jur: 'US', trigger: 'Misconduct occurs', type: 'statute_of_limitations', days: 730, extended: null, extCond: null, tolling: true, tollCond: ['equitable_tolling','discovery_rule'], authority: '42 U.S.C. § 1983' },
  // Benefits deadlines
  { claim: 'ssdi_denial', jur: 'US', trigger: 'Initial denial', type: 'appeal', days: 60, extended: null, extCond: null, tolling: true, tollCond: ['good_cause'], authority: '20 C.F.R. § 404.909' },
  { claim: 'ssdi_denial', jur: 'US', trigger: 'ALJ decision', type: 'appeal', days: 60, extended: null, extCond: null, tolling: true, tollCond: ['good_cause'], authority: '20 C.F.R. § 404.968' },
  { claim: 'ssdi_denial', jur: 'US', trigger: 'Appeals Council decision', type: 'filing', days: 60, extended: null, extCond: null, tolling: true, tollCond: ['good_cause'], authority: '42 U.S.C. § 405(g)' },
  { claim: 'unemployment_denial', jur: 'WA', trigger: 'Determination issued', type: 'appeal', days: 30, extended: null, extCond: null, tolling: false, tollCond: null, authority: 'RCW 50.32.010' },
  { claim: 'workers_comp_denial', jur: 'WA', trigger: 'Order issued', type: 'appeal', days: 60, extended: null, extCond: null, tolling: false, tollCond: null, authority: 'RCW 51.52.060' },
  // State-specific deadlines
  { claim: 'employment_discrimination', jur: 'CA', trigger: 'Discriminatory act occurs', type: 'filing', days: 365, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation','equitable_tolling'], authority: 'Cal. Gov. Code § 12960' },
  { claim: 'employment_discrimination', jur: 'NY', trigger: 'Discriminatory act occurs', type: 'filing', days: 365, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation'], authority: 'N.Y. Exec. Law § 297(5)' },
  { claim: 'wage_theft', jur: 'CA', trigger: 'Wage violation occurs', type: 'statute_of_limitations', days: 1095, extended: 1460, extCond: 'Written contract', tolling: true, tollCond: ['discovery_rule'], authority: 'Cal. Lab. Code § 203' },
  { claim: 'wage_theft', jur: 'NY', trigger: 'Wage violation occurs', type: 'statute_of_limitations', days: 2190, extended: null, extCond: null, tolling: false, tollCond: null, authority: 'N.Y. Lab. Law § 198(3)' },
  { claim: 'consumer_fraud', jur: 'CA', trigger: 'Fraud occurs', type: 'statute_of_limitations', days: 1460, extended: null, extCond: null, tolling: true, tollCond: ['discovery_rule'], authority: 'Cal. Bus. & Prof. Code § 17208' },
  { claim: 'housing_discrimination', jur: 'CA', trigger: 'Discriminatory act occurs', type: 'filing', days: 365, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation'], authority: 'Cal. Gov. Code § 12980' },
  { claim: 'housing_discrimination', jur: 'NY', trigger: 'Discriminatory act occurs', type: 'filing', days: 365, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation'], authority: 'N.Y. Exec. Law § 297(5)' },
  { claim: 'employment_discrimination', jur: 'WA', trigger: 'Discriminatory act occurs', type: 'filing', days: 180, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation'], authority: 'RCW 49.60.230' },
  { claim: 'consumer_fraud', jur: 'WA', trigger: 'Deceptive act occurs', type: 'statute_of_limitations', days: 1460, extended: null, extCond: null, tolling: true, tollCond: ['discovery_rule'], authority: 'RCW 19.86.120' },
  { claim: 'employment_discrimination', jur: 'TX', trigger: 'Discriminatory act occurs', type: 'filing', days: 180, extended: null, extCond: null, tolling: false, tollCond: null, authority: 'Tex. Lab. Code § 21.202' },
  { claim: 'consumer_fraud', jur: 'TX', trigger: 'Deceptive act occurs', type: 'statute_of_limitations', days: 730, extended: null, extCond: null, tolling: true, tollCond: ['discovery_rule'], authority: 'Tex. Bus. & Com. Code § 17.565' },
  { claim: 'employment_discrimination', jur: 'FL', trigger: 'Discriminatory act occurs', type: 'filing', days: 365, extended: null, extCond: null, tolling: false, tollCond: null, authority: 'Fla. Stat. § 760.11(1)' },
  { claim: 'employment_discrimination', jur: 'IL', trigger: 'Discriminatory act occurs', type: 'filing', days: 300, extended: null, extCond: null, tolling: true, tollCond: ['continuing_violation'], authority: '775 ILCS 5/7A-102' },
];

for (const d of deadlineData) {
  deadlines.push([
    did++, null, d.claim, d.jur, d.trigger, d.type,
    d.days, d.extended, d.extCond,
    d.tolling ? 1 : 0, d.tollCond ? JSON.stringify(d.tollCond) : null,
    30, 7, d.authority, null, now, now
  ]);
}

const deadlineCols = ['id','workflowId','claimType','jurisdiction','triggerEvent','deadlineType','timeLimitDays','extendedLimitDays','extendedCondition','tollingPossible','tollingConditions','warningThresholdDays','criticalThresholdDays','authority','notes','createdAt','updatedAt'];
await safeInsert('deadline_rules', deadlineCols, deadlines, 'Deadline Rules');

// ============================================================
// 6. ESCALATION ROUTES — Need ~39 more to hit target of 50
// ============================================================
console.log('\n6. Seeding Escalation Routes...');

const escalations = [];
let eid = 100;

const escalationData = [
  { title: 'Wage Theft - State Labor Board Escalation', trigger: ['employer_nonresponsive','wage_claim_denied'], routes: [{step:1,action:'File state labor board complaint',agency:'State Department of Labor',timeline:'30 days'},{step:2,action:'Request investigation',timeline:'60-90 days'},{step:3,action:'Appeal to administrative court',timeline:'30 days after denial'}], priority: 'high' },
  { title: 'Wage Theft - Federal DOL Escalation', trigger: ['state_remedy_exhausted','multi_state_employer'], routes: [{step:1,action:'File DOL-WHD complaint',agency:'DOL Wage and Hour Division',timeline:'No strict deadline'},{step:2,action:'Cooperate with investigation',timeline:'60-120 days'},{step:3,action:'Private federal lawsuit',timeline:'2-3 years SOL'}], priority: 'high' },
  { title: 'Employment Discrimination - EEOC Escalation', trigger: ['discrimination_complaint_filed','employer_retaliation'], routes: [{step:1,action:'File EEOC charge',agency:'EEOC',timeline:'180/300 days'},{step:2,action:'Participate in mediation',timeline:'30-60 days'},{step:3,action:'Request right-to-sue letter',timeline:'After 180 days'},{step:4,action:'File federal lawsuit',timeline:'90 days after RTS'}], priority: 'high' },
  { title: 'Employment Discrimination - State FEPA Escalation', trigger: ['state_law_broader_protections','prefer_state_forum'], routes: [{step:1,action:'File with state FEPA',timeline:'Varies by state'},{step:2,action:'Administrative investigation',timeline:'90-180 days'},{step:3,action:'Administrative hearing or state court',timeline:'Varies'}], priority: 'medium' },
  { title: 'Housing Discrimination - HUD Escalation', trigger: ['housing_discrimination_complaint','landlord_retaliation'], routes: [{step:1,action:'File HUD complaint',agency:'HUD',timeline:'1 year'},{step:2,action:'HUD investigation',timeline:'100 days'},{step:3,action:'Administrative hearing or federal court',timeline:'Varies'}], priority: 'high' },
  { title: 'Housing Discrimination - State Fair Housing Escalation', trigger: ['state_housing_complaint','local_agency_available'], routes: [{step:1,action:'File with state/local fair housing agency',timeline:'Varies'},{step:2,action:'Conciliation attempt',timeline:'30-60 days'},{step:3,action:'State court action',timeline:'2 years SOL'}], priority: 'medium' },
  { title: 'Consumer Fraud - CFPB Escalation', trigger: ['financial_product_complaint','debt_collection_violation'], routes: [{step:1,action:'Submit CFPB complaint',agency:'CFPB',timeline:'No deadline'},{step:2,action:'Company response period',timeline:'15 days'},{step:3,action:'CFPB investigation if pattern detected',timeline:'Varies'}], priority: 'medium' },
  { title: 'Consumer Fraud - State AG Escalation', trigger: ['deceptive_trade_practice','consumer_fraud_pattern'], routes: [{step:1,action:'File complaint with state AG consumer protection division',timeline:'No strict deadline'},{step:2,action:'AG investigation',timeline:'60-180 days'},{step:3,action:'Private action under state consumer protection act',timeline:'Varies by state SOL'}], priority: 'medium' },
  { title: 'OSHA Safety Violation Escalation', trigger: ['workplace_hazard_reported','employer_failed_to_correct'], routes: [{step:1,action:'File OSHA complaint',agency:'OSHA',timeline:'No deadline for safety'},{step:2,action:'OSHA inspection',timeline:'Days to weeks'},{step:3,action:'Citation and penalty',timeline:'6 months'},{step:4,action:'Contest citation (employer) or complaint about inadequate response',timeline:'15 days'}], priority: 'critical' },
  { title: 'Whistleblower Retaliation Escalation', trigger: ['retaliation_after_report','termination_after_complaint'], routes: [{step:1,action:'File with appropriate agency (OSHA/SEC/DOL)',timeline:'30-180 days depending on statute'},{step:2,action:'Agency investigation',timeline:'60-180 days'},{step:3,action:'Private lawsuit if no agency resolution',timeline:'Varies'}], priority: 'critical' },
  { title: 'SSDI Denial Escalation', trigger: ['initial_denial','reconsideration_denial'], routes: [{step:1,action:'Request reconsideration',agency:'SSA',timeline:'60 days'},{step:2,action:'Request ALJ hearing',timeline:'60 days after recon denial'},{step:3,action:'Appeals Council review',timeline:'60 days after ALJ'},{step:4,action:'Federal court review',timeline:'60 days after AC'}], priority: 'high' },
  { title: 'Unemployment Benefits Denial Escalation', trigger: ['unemployment_denied','employer_contested'], routes: [{step:1,action:'File appeal to ALJ',timeline:'30 days'},{step:2,action:'ALJ hearing',timeline:'2-4 weeks'},{step:3,action:'Appeal to review board',timeline:'30 days'},{step:4,action:'Court appeal',timeline:'30 days'}], priority: 'high' },
  { title: 'Workers Compensation Denial Escalation', trigger: ['claim_denied','benefits_terminated'], routes: [{step:1,action:'File protest/appeal',timeline:'60 days'},{step:2,action:'Mediation conference',timeline:'30-60 days'},{step:3,action:'Hearing before ALJ',timeline:'60-120 days'},{step:4,action:'Board review',timeline:'30 days'}], priority: 'high' },
  { title: 'Section 1983 - Police Misconduct Escalation', trigger: ['excessive_force','false_arrest','civil_rights_violation'], routes: [{step:1,action:'File internal affairs complaint',timeline:'Varies'},{step:2,action:'File complaint with civilian review board',timeline:'Varies'},{step:3,action:'File DOJ civil rights complaint',timeline:'No strict deadline'},{step:4,action:'File Section 1983 lawsuit',timeline:'State personal injury SOL'}], priority: 'critical' },
  { title: 'FMLA Interference Escalation', trigger: ['leave_denied','retaliation_after_leave'], routes: [{step:1,action:'File DOL-WHD complaint',agency:'DOL',timeline:'2 years (3 if willful)'},{step:2,action:'DOL investigation',timeline:'60-120 days'},{step:3,action:'Private lawsuit',timeline:'2-3 years SOL'}], priority: 'high' },
  { title: 'ERISA Benefit Denial Escalation', trigger: ['benefit_claim_denied','appeal_denied'], routes: [{step:1,action:'File internal appeal',timeline:'180 days'},{step:2,action:'External review (if applicable)',timeline:'Varies'},{step:3,action:'Federal court lawsuit',timeline:'Varies by circuit'}], priority: 'high' },
  { title: 'Fair Credit Reporting Escalation', trigger: ['credit_report_error','dispute_rejected'], routes: [{step:1,action:'Dispute with CRA',timeline:'No deadline'},{step:2,action:'Dispute with furnisher',timeline:'After CRA dispute'},{step:3,action:'CFPB complaint',timeline:'No deadline'},{step:4,action:'Private FCRA lawsuit',timeline:'2 years from violation or discovery'}], priority: 'medium' },
  { title: 'Debt Collection Harassment Escalation', trigger: ['fdcpa_violation','harassment_calls'], routes: [{step:1,action:'Send cease communication letter',timeline:'Anytime'},{step:2,action:'File CFPB complaint',timeline:'No deadline'},{step:3,action:'File state AG complaint',timeline:'No deadline'},{step:4,action:'Private FDCPA lawsuit',timeline:'1 year'}], priority: 'medium' },
  { title: 'Environmental Whistleblower Escalation', trigger: ['environmental_violation_reported','retaliation'], routes: [{step:1,action:'File OSHA whistleblower complaint',timeline:'30 days'},{step:2,action:'OSHA investigation',timeline:'60-90 days'},{step:3,action:'File citizen suit under environmental statute',timeline:'60 days notice required'}], priority: 'high' },
  { title: 'ADA Public Accommodation Escalation', trigger: ['accessibility_barrier','accommodation_denied'], routes: [{step:1,action:'Send demand letter to business',timeline:'No deadline'},{step:2,action:'File DOJ complaint',timeline:'No strict deadline'},{step:3,action:'Private ADA Title III lawsuit',timeline:'No damages, injunctive only'},{step:4,action:'State law claim for damages',timeline:'Varies by state'}], priority: 'medium' },
  { title: 'Tenant Rights - Habitability Escalation', trigger: ['uninhabitable_conditions','landlord_nonresponsive'], routes: [{step:1,action:'Written notice to landlord',timeline:'Varies by state'},{step:2,action:'File complaint with local housing authority',timeline:'No deadline'},{step:3,action:'Rent withholding or repair-and-deduct',timeline:'After notice period'},{step:4,action:'File lawsuit for breach of warranty',timeline:'State SOL'}], priority: 'high' },
  { title: 'Tenant Rights - Illegal Eviction Escalation', trigger: ['lockout','utility_shutoff','self_help_eviction'], routes: [{step:1,action:'Call police for illegal lockout',timeline:'Immediate'},{step:2,action:'File emergency TRO',timeline:'Immediate'},{step:3,action:'File lawsuit for damages',timeline:'State SOL'}], priority: 'critical' },
  { title: 'Veterans Benefits Denial Escalation', trigger: ['va_claim_denied','rating_too_low'], routes: [{step:1,action:'File Notice of Disagreement',agency:'VA',timeline:'1 year'},{step:2,action:'Request DRO review or BVA hearing',timeline:'Varies'},{step:3,action:'Appeal to CAVC',timeline:'120 days after BVA decision'},{step:4,action:'Federal Circuit appeal',timeline:'60 days after CAVC'}], priority: 'high' },
  { title: 'Immigration - Asylum Escalation', trigger: ['asylum_denied','removal_proceedings'], routes: [{step:1,action:'File with immigration court',timeline:'1 year from arrival'},{step:2,action:'Immigration court hearing',timeline:'Varies'},{step:3,action:'Appeal to BIA',timeline:'30 days'},{step:4,action:'Federal circuit court petition',timeline:'30 days after BIA'}], priority: 'critical' },
];

for (const e of escalationData) {
  escalations.push([
    eid++, 1, e.title, JSON.stringify(e.trigger), JSON.stringify(e.routes),
    e.priority, null, null, now, now
  ]);
}

const escalationCols = ['id','workflowId','title','triggerConditions','routes','escalationPriority','preservationRequirements','notes','createdAt','updatedAt'];
await safeInsert('escalation_routes', escalationCols, escalations, 'Escalation Routes');

// ============================================================
// 7. EVIDENCE PROFILES — Need ~40 more to hit target of 50
// ============================================================
console.log('\n7. Seeding Evidence Profiles...');

const profiles = [];
let pid = 100;

const profileData = [
  { issue: 'Wage Theft - Unpaid Overtime', domain: 'employment', required: ['pay_stubs','time_records','employment_contract'], recommended: ['coworker_statements','employer_communications','handbook'], highValue: ['surveillance_footage','electronic_timekeeping_data','payroll_records'], failures: ['incomplete_time_records','verbal_only_agreement','delayed_complaint'] },
  { issue: 'Wage Theft - Minimum Wage Violation', domain: 'employment', required: ['pay_stubs','hours_worked_log','employment_agreement'], recommended: ['tip_records','employer_policies','coworker_testimony'], highValue: ['payroll_system_data','pos_system_records'], failures: ['cash_payment_no_records','informal_employment'] },
  { issue: 'Wrongful Termination - Discrimination', domain: 'employment', required: ['termination_notice','performance_reviews','employment_history'], recommended: ['comparator_evidence','supervisor_communications','hr_complaints'], highValue: ['statistical_evidence','pattern_evidence','internal_investigation_records'], failures: ['no_documented_complaints','performance_issues_documented','at_will_employment'] },
  { issue: 'Sexual Harassment - Hostile Work Environment', domain: 'employment', required: ['incident_reports','complaint_records','witness_statements'], recommended: ['text_messages','emails','counseling_records'], highValue: ['prior_complaints_against_harasser','employer_policy_failures','pattern_evidence'], failures: ['delayed_reporting','no_witnesses','informal_complaints_only'] },
  { issue: 'FMLA Interference', domain: 'employment', required: ['leave_request','medical_certification','employer_response'], recommended: ['employment_history','performance_reviews_pre_leave','communications_during_leave'], highValue: ['comparator_treatment','employer_policy_manual','hr_records'], failures: ['insufficient_medical_documentation','eligibility_not_established'] },
  { issue: 'Disability Accommodation Denial', domain: 'employment', required: ['accommodation_request','medical_documentation','employer_response'], recommended: ['interactive_process_records','job_description','alternative_accommodations'], highValue: ['accommodation_provided_to_others','cost_analysis','expert_opinion'], failures: ['vague_medical_documentation','no_formal_request','undue_hardship_evidence'] },
  { issue: 'Housing Discrimination - Rental', domain: 'housing', required: ['application_records','denial_communication','fair_housing_testing_results'], recommended: ['comparator_applications','landlord_statements','advertising_materials'], highValue: ['pattern_evidence','statistical_data','prior_complaints'], failures: ['legitimate_denial_reason_documented','no_testing_evidence'] },
  { issue: 'Housing Discrimination - Lending', domain: 'housing', required: ['loan_application','denial_letter','credit_report'], recommended: ['comparator_applications','lender_policies','appraisal_records'], highValue: ['hmda_data','statistical_analysis','internal_communications'], failures: ['legitimate_credit_factors','incomplete_application'] },
  { issue: 'Tenant Habitability Violation', domain: 'housing', required: ['photos_of_conditions','written_complaints_to_landlord','inspection_reports'], recommended: ['medical_records','repair_requests','rent_payment_history'], highValue: ['code_violation_citations','prior_tenant_complaints','expert_inspection'], failures: ['no_written_notice','tenant_caused_damage','minor_conditions'] },
  { issue: 'Illegal Eviction', domain: 'housing', required: ['lease_agreement','eviction_notice','proof_of_lockout'], recommended: ['police_report','witness_statements','photos_of_changed_locks'], highValue: ['video_evidence','text_messages_from_landlord','utility_shutoff_records'], failures: ['lease_expired','proper_notice_given'] },
  { issue: 'Debt Collection Harassment', domain: 'consumer', required: ['call_logs','written_communications','debt_validation_request'], recommended: ['voicemail_recordings','credit_report_entries','cease_communication_letter'], highValue: ['recorded_calls','pattern_of_calls','third_party_disclosure_evidence'], failures: ['no_documentation_of_calls','valid_debt_acknowledged'] },
  { issue: 'Credit Report Error', domain: 'consumer', required: ['credit_reports_from_all_bureaus','dispute_letters','cra_responses'], recommended: ['supporting_documentation','identity_theft_report','creditor_communications'], highValue: ['proof_of_reinvestigation_failure','damages_documentation','pattern_of_errors'], failures: ['dispute_not_filed','error_corrected_promptly'] },
  { issue: 'Police Excessive Force', domain: 'civil_rights', required: ['medical_records','incident_report','witness_statements'], recommended: ['body_camera_footage','surveillance_video','911_records'], highValue: ['prior_complaints_against_officer','department_use_of_force_records','expert_testimony'], failures: ['resisting_arrest_documented','minor_injuries','no_video_evidence'] },
  { issue: 'False Arrest', domain: 'civil_rights', required: ['arrest_report','booking_records','case_disposition'], recommended: ['witness_statements','surveillance_footage','officer_body_camera'], highValue: ['lack_of_probable_cause_evidence','fabricated_evidence','pattern_of_false_arrests'], failures: ['probable_cause_existed','conviction_obtained'] },
  { issue: 'SSDI Denial', domain: 'benefits', required: ['medical_records','treating_physician_opinions','work_history'], recommended: ['functional_capacity_evaluation','daily_activity_log','medication_records'], highValue: ['vocational_expert_opinion','medical_expert_opinion','longitudinal_treatment_records'], failures: ['gaps_in_treatment','non_compliance_with_treatment','insufficient_medical_evidence'] },
  { issue: 'Unemployment Benefits Denial', domain: 'benefits', required: ['separation_notice','employer_statements','work_search_records'], recommended: ['employment_contract','performance_reviews','communications_about_separation'], highValue: ['employer_policy_violations','witness_statements','prior_warnings_documentation'], failures: ['voluntary_quit_without_good_cause','misconduct_documented'] },
  { issue: 'Workers Compensation Denial', domain: 'benefits', required: ['injury_report','medical_records','employer_incident_report'], recommended: ['witness_statements','safety_records','prior_medical_history'], highValue: ['independent_medical_examination','workplace_safety_violations','surveillance_contradicting_denial'], failures: ['pre_existing_condition','delayed_reporting','off_duty_injury'] },
  { issue: 'Consumer Fraud - Deceptive Practices', domain: 'consumer', required: ['purchase_records','advertising_materials','product_documentation'], recommended: ['communications_with_seller','warranty_information','comparable_products'], highValue: ['pattern_of_complaints','regulatory_actions','internal_company_documents'], failures: ['buyer_beware_defense','adequate_disclosures_made'] },
  { issue: 'Whistleblower Retaliation', domain: 'employment', required: ['protected_report_documentation','adverse_action_evidence','timeline_showing_proximity'], recommended: ['performance_reviews_before_and_after','comparator_treatment','supervisor_communications'], highValue: ['internal_investigation_records','pattern_of_retaliation','company_policy_violations'], failures: ['legitimate_business_reason','no_knowledge_of_report','long_time_gap'] },
  { issue: 'ERISA Benefit Denial', domain: 'benefits', required: ['plan_documents','denial_letter','claim_file'], recommended: ['medical_records','treating_physician_opinion','administrative_record'], highValue: ['conflict_of_interest_evidence','claim_file_irregularities','peer_review_deficiencies'], failures: ['plan_exclusion_applies','untimely_appeal'] },
  { issue: 'Environmental Violation', domain: 'environment', required: ['sampling_data','permit_records','violation_reports'], recommended: ['photos_of_contamination','health_impact_data','regulatory_correspondence'], highValue: ['internal_company_documents','whistleblower_testimony','historical_violation_pattern'], failures: ['within_permit_limits','natural_occurrence'] },
  { issue: 'Predatory Lending', domain: 'consumer', required: ['loan_documents','disclosure_statements','payment_history'], recommended: ['credit_report_at_origination','broker_communications','comparable_loan_terms'], highValue: ['yield_spread_premium_data','steering_evidence','statistical_disparate_impact'], failures: ['borrower_sophistication','adequate_disclosures'] },
  { issue: 'Nursing Home Abuse/Neglect', domain: 'healthcare', required: ['medical_records','incident_reports','staffing_records'], recommended: ['photos_of_injuries','family_communications','regulatory_inspection_reports'], highValue: ['prior_citations','pattern_of_complaints','expert_medical_opinion'], failures: ['pre_existing_conditions','adequate_care_documented'] },
  { issue: 'Medical Malpractice', domain: 'healthcare', required: ['medical_records','expert_opinion','standard_of_care_documentation'], recommended: ['informed_consent_records','hospital_policies','peer_review_records'], highValue: ['similar_incident_reports','expert_testimony','internal_quality_reviews'], failures: ['known_complication','informed_consent_obtained','no_expert_support'] },
  { issue: 'Voting Rights Violation', domain: 'civil_rights', required: ['voter_registration_records','election_records','discriminatory_policy_documentation'], recommended: ['statistical_analysis','witness_testimony','historical_discrimination_evidence'], highValue: ['intent_evidence','pattern_evidence','expert_demographic_analysis'], failures: ['facially_neutral_policy','legitimate_state_interest'] },
  { issue: 'Immigration - Asylum Claim', domain: 'immigration', required: ['country_conditions_report','personal_declaration','corroborating_evidence'], recommended: ['medical_psychological_evaluation','expert_testimony','news_reports'], highValue: ['prior_persecution_documentation','group_membership_evidence','government_targeting_evidence'], failures: ['safe_third_country','firm_resettlement','one_year_filing_deadline'] },
];

for (const p of profileData) {
  profiles.push([
    pid++, p.issue, p.domain, JSON.stringify(p.required), JSON.stringify(p.recommended),
    JSON.stringify(p.highValue), JSON.stringify(p.failures), null, null, now, now
  ]);
}

const profileCols = ['id','issueType','domain','requiredMinimum','recommended','highValue','commonFailureModes','preservationNotes','spoliationRisks','createdAt','updatedAt'];
await safeInsert('evidence_profiles', profileCols, profiles, 'Evidence Profiles');

// ============================================================
// 8. LUMENSEND TEMPLATES — Need ~36 more to hit target of 50
// ============================================================
console.log('\n8. Seeding LumenSend Templates...');

const templates = [];
let tid = 100;

const templateData = [
  { type: 'demand', name: 'Wage Theft Demand Letter', desc: 'Demand letter for unpaid wages', subject: 'Demand for Payment of Unpaid Wages - {{employee_name}}', body: 'Dear {{employer_name}},\n\nThis letter constitutes formal demand for payment of wages owed to {{employee_name}}. Our records indicate that {{employee_name}} is owed ${{amount}} for {{period}}.\n\nUnder {{statute}}, you are required to pay all wages earned. Failure to pay within {{deadline}} days may result in additional penalties including liquidated damages.\n\nPlease remit payment immediately.\n\nSincerely,\n{{sender_name}}' },
  { type: 'demand', name: 'Discrimination Demand Letter', desc: 'Pre-litigation demand for employment discrimination', subject: 'Demand Letter - Discriminatory Treatment of {{employee_name}}', body: 'Dear {{employer_name}},\n\nThis letter is sent on behalf of {{employee_name}} regarding discriminatory treatment in violation of {{statute}}.\n\n{{employee_name}} experienced {{description_of_discrimination}}. This conduct constitutes unlawful discrimination based on {{protected_class}}.\n\nWe demand: {{demands}}.\n\nFailure to respond within {{deadline}} days will result in the filing of a formal charge with the appropriate agency.\n\nSincerely,\n{{sender_name}}' },
  { type: 'demand', name: 'Landlord Repair Demand', desc: 'Demand letter for habitability repairs', subject: 'Demand for Immediate Repairs - {{property_address}}', body: 'Dear {{landlord_name}},\n\nThis letter serves as formal notice that the following conditions at {{property_address}} require immediate repair:\n\n{{conditions}}\n\nThese conditions violate {{statute}} and the implied warranty of habitability. You are required to make repairs within {{deadline}} days.\n\nFailure to act may result in rent withholding, repair-and-deduct remedies, or legal action.\n\nSincerely,\n{{tenant_name}}' },
  { type: 'demand', name: 'Debt Collection Cease and Desist', desc: 'Cease communication letter under FDCPA', subject: 'Cease Communication Demand - Account {{account_number}}', body: 'Dear {{collector_name}},\n\nPursuant to 15 U.S.C. § 1692c(c), I hereby demand that you cease all communication with me regarding the alleged debt referenced above.\n\nThis letter does not constitute acknowledgment of the debt. Any further communication in violation of this demand will result in legal action under the FDCPA.\n\nSincerely,\n{{consumer_name}}' },
  { type: 'complaint', name: 'EEOC Charge Template', desc: 'Template for filing EEOC discrimination charge', subject: 'Charge of Discrimination - {{employee_name}} v. {{employer_name}}', body: 'I, {{employee_name}}, hereby file this charge of discrimination against {{employer_name}}.\n\nI was employed as a {{position}} from {{start_date}} to {{end_date}}.\n\nI believe I was discriminated against because of my {{protected_class}} in violation of {{statute}}.\n\nThe discriminatory acts include: {{description}}.\n\nI have not previously filed a charge regarding these matters.' },
  { type: 'complaint', name: 'HUD Housing Complaint Template', desc: 'Template for filing HUD housing discrimination complaint', subject: 'Housing Discrimination Complaint - {{complainant_name}}', body: 'I, {{complainant_name}}, file this complaint against {{respondent_name}} regarding housing discrimination at {{property_address}}.\n\nOn {{date}}, I was discriminated against in {{transaction_type}} because of my {{protected_class}}.\n\nThe discriminatory acts include: {{description}}.\n\nI request that HUD investigate this complaint and take appropriate action.' },
  { type: 'complaint', name: 'OSHA Safety Complaint', desc: 'Template for filing OSHA workplace safety complaint', subject: 'Workplace Safety Complaint - {{workplace_name}}', body: 'I wish to report the following hazardous conditions at {{workplace_name}}, located at {{address}}:\n\n{{hazard_description}}\n\nThese conditions violate {{standard}} and pose an immediate danger to {{number_affected}} employees.\n\nI request an inspection of these conditions. I wish my identity to remain confidential.' },
  { type: 'complaint', name: 'CFPB Consumer Complaint', desc: 'Template for filing CFPB consumer complaint', subject: 'Consumer Complaint Against {{company_name}}', body: 'I am filing this complaint against {{company_name}} regarding {{product_type}}.\n\nOn {{date}}, {{description_of_issue}}.\n\nI have attempted to resolve this issue by {{resolution_attempts}}.\n\nThe company has {{company_response}}.\n\nI am seeking {{desired_resolution}}.' },
  { type: 'inquiry', name: 'FOIA Request - Federal', desc: 'Federal Freedom of Information Act request', subject: 'FOIA Request - {{subject}}', body: 'Dear FOIA Officer,\n\nPursuant to the Freedom of Information Act, 5 U.S.C. § 552, I request access to the following records:\n\n{{records_description}}\n\nThe time period for this request is {{date_range}}.\n\nI am willing to pay fees up to ${{fee_limit}}. Please contact me if fees will exceed this amount.\n\nI request a waiver of fees because {{fee_waiver_justification}}.\n\nSincerely,\n{{requester_name}}' },
  { type: 'inquiry', name: 'Public Records Request - State', desc: 'State public records request template', subject: 'Public Records Request - {{subject}}', body: 'Dear Records Officer,\n\nPursuant to {{state_public_records_act}}, I request copies of the following records:\n\n{{records_description}}\n\nPlease provide these records within the time required by law. I am willing to pay reasonable copying fees.\n\nSincerely,\n{{requester_name}}' },
  { type: 'appeal', name: 'SSA Disability Appeal', desc: 'Template for appealing SSA disability denial', subject: 'Request for Reconsideration - {{claimant_name}} - SSN: XXX-XX-{{last4}}', body: 'Dear Social Security Administration,\n\nI, {{claimant_name}}, hereby request reconsideration of the denial of my disability benefits claim dated {{denial_date}}.\n\nI disagree with this decision because: {{reasons_for_disagreement}}\n\nAdditional medical evidence is attached showing: {{new_evidence_summary}}\n\nMy conditions continue to prevent me from performing substantial gainful activity.\n\nSincerely,\n{{claimant_name}}' },
  { type: 'appeal', name: 'Unemployment Benefits Appeal', desc: 'Template for appealing unemployment denial', subject: 'Appeal of Unemployment Benefits Determination - {{claimant_name}}', body: 'Dear Appeals Division,\n\nI hereby appeal the determination dated {{determination_date}} denying my unemployment benefits claim.\n\nI disagree with the finding that {{denial_reason}}.\n\nThe facts show: {{supporting_facts}}\n\nI request a hearing to present my case.\n\nSincerely,\n{{claimant_name}}' },
  { type: 'appeal', name: 'Workers Compensation Appeal', desc: 'Template for appealing workers comp denial', subject: 'Protest/Appeal - {{worker_name}} - Claim {{claim_number}}', body: 'Dear Board of Industrial Insurance Appeals,\n\nI hereby protest the order dated {{order_date}} regarding my workers compensation claim.\n\nI disagree with the determination because: {{reasons}}\n\nMedical evidence supports my claim: {{medical_evidence_summary}}\n\nI request a hearing.\n\nSincerely,\n{{worker_name}}' },
  { type: 'notice', name: 'Tenant Notice of Defects', desc: 'Formal notice of habitability defects to landlord', subject: 'Notice of Defective Conditions - {{unit_address}}', body: 'Dear {{landlord_name}},\n\nThis letter serves as formal written notice of the following defective conditions at {{unit_address}}:\n\n{{defect_list}}\n\nThese conditions affect the habitability of the premises. Under {{statute}}, you are required to make repairs within {{repair_deadline}} days.\n\nPlease contact me at {{contact_info}} to schedule repairs.\n\nSincerely,\n{{tenant_name}}' },
  { type: 'notice', name: 'Debt Validation Request', desc: 'Request for debt validation under FDCPA', subject: 'Debt Validation Request - Account {{account_ref}}', body: 'Dear {{collector_name}},\n\nPursuant to 15 U.S.C. § 1692g, I request validation of the alleged debt referenced above.\n\nPlease provide:\n1. The amount of the debt and how it was calculated\n2. The name and address of the original creditor\n3. A copy of the original signed agreement\n4. Proof that you are licensed to collect in {{state}}\n\nUntil validation is provided, all collection activity must cease.\n\nSincerely,\n{{consumer_name}}' },
  { type: 'application', name: 'Reasonable Accommodation Request', desc: 'ADA reasonable accommodation request', subject: 'Request for Reasonable Accommodation - {{employee_name}}', body: 'Dear {{employer_name}},\n\nI am requesting a reasonable accommodation under the ADA.\n\nRequested accommodation: {{requested_accommodation}}\n\nSincerely,\n{{employee_name}}' },
  { type: 'application', name: 'SSDI Application Cover', desc: 'Cover letter for SSDI application', subject: 'SSDI Application - {{claimant_name}}', body: 'Dear SSA,\\n\\nEnclosed is my application for SSDI benefits. I have been unable to work since {{onset_date}} due to {{conditions}}.\\n\\nSincerely,\\n{{claimant_name}}' },
  { type: 'application', name: 'Section 8 Housing Application', desc: 'Cover letter for Section 8 voucher', subject: 'Housing Choice Voucher Application - {{applicant_name}}', body: 'Dear Housing Authority,\\n\\nI am applying for a Housing Choice Voucher. My household has {{household_size}} members with annual income of ${{income}}.\\n\\nSincerely,\\n{{applicant_name}}' },
  { type: 'motion', name: 'Motion for Protective Order', desc: 'Protective order in DV cases', subject: 'Motion for Order of Protection - {{petitioner_name}}', body: 'COMES NOW {{petitioner_name}}, and moves this Court for an Order of Protection against {{respondent_name}}.\\n\\nRespondent has committed: {{description}}.\\n\\nPetitioner requests: {{relief_requested}}.\\n\\nDated: {{date}}' },
  { type: 'motion', name: 'Motion for Fee Waiver', desc: 'Motion to waive court filing fees', subject: 'Motion to Proceed IFP - {{party_name}}', body: 'COMES NOW {{party_name}}, and moves to proceed in forma pauperis.\\n\\nMovant is unable to pay fees. Monthly income: ${{income}}. Monthly expenses: ${{expenses}}.\\n\\nMovant requests waiver of all fees.' },
  { type: 'motion', name: 'Motion for Continuance', desc: 'Motion to continue hearing date', subject: 'Motion for Continuance - Case {{case_number}}', body: 'COMES NOW {{party_name}}, and moves for a continuance of the hearing on {{hearing_date}}.\\n\\nGood cause: {{reason}}.\\n\\nProposed new date: {{proposed_date}}.' },
  { type: 'report', name: 'Workplace Safety Incident Report', desc: 'Internal safety incident documentation', subject: 'Safety Incident Report - {{date}}', body: 'INCIDENT REPORT\\n\\nDate: {{date}}\\nLocation: {{location}}\\nInjured Party: {{injured_party}}\\n\\nDescription: {{description}}\\n\\nWitnesses: {{witnesses}}\\n\\nAction Taken: {{action_taken}}' },
  { type: 'report', name: 'Discrimination Incident Report', desc: 'Internal discrimination incident log', subject: 'Discrimination Incident - {{date}}', body: 'INCIDENT REPORT\\n\\nDate: {{date}}\\nReporter: {{reporter}}\\nAlleged Perpetrator: {{perpetrator}}\\n\\nType: {{discrimination_type}}\\nDescription: {{description}}\\n\\nWitnesses: {{witnesses}}' },
  { type: 'notice', name: 'ADA Accessibility Complaint', desc: 'Notice of ADA Title III violation', subject: 'ADA Accessibility Complaint - {{business_name}}', body: 'Dear {{business_name}},\\n\\nThis letter notifies you of ADA Title III violations at {{location}}.\\n\\nBarriers identified: {{barriers}}\\n\\nPlease remediate within {{deadline}} days.\\n\\nSincerely,\\n{{complainant_name}}' },
  { type: 'notice', name: 'WARN Act Notice', desc: 'Worker Adjustment and Retraining notice', subject: 'WARN Act Notice - {{company_name}}', body: 'Dear Employees,\\n\\nPursuant to the WARN Act, {{company_name}} provides notice that {{action_type}} affecting {{number_affected}} employees will occur on {{effective_date}}.\\n\\nAffected positions: {{positions}}.\\n\\nContact {{hr_contact}} for information.' },
  { type: 'demand', name: 'Insurance Bad Faith Demand', desc: 'Demand letter for insurance bad faith', subject: 'Bad Faith Demand - Claim {{claim_number}}', body: 'Dear {{insurer_name}},\\n\\nYour handling of claim {{claim_number}} constitutes bad faith under {{statute}}.\\n\\nSpecifically: {{bad_faith_acts}}.\\n\\nDemand: {{amount}} plus consequential damages.\\n\\nSincerely,\\n{{claimant_name}}' },
  { type: 'demand', name: 'Retaliation Demand Letter', desc: 'Demand letter for workplace retaliation', subject: 'Demand - Retaliatory Action Against {{employee_name}}', body: 'Dear {{employer_name}},\\n\\n{{employee_name}} was subjected to retaliation for {{protected_activity}}.\\n\\nThe retaliatory acts include: {{acts}}.\\n\\nDemand: {{demands}}.\\n\\nSincerely,\\n{{sender_name}}' },
  { type: 'complaint', name: 'State AG Consumer Complaint', desc: 'Consumer complaint to state attorney general', subject: 'Consumer Complaint - {{company_name}}', body: 'Dear Attorney General,\\n\\nI file this complaint against {{company_name}} for {{violation_type}}.\\n\\nOn {{date}}, {{description}}.\\n\\nI have suffered damages of ${{amount}}.\\n\\nI request investigation.\\n\\nSincerely,\\n{{consumer_name}}' },
  { type: 'complaint', name: 'DOL Wage Complaint', desc: 'Department of Labor wage complaint', subject: 'Wage and Hour Complaint - {{employer_name}}', body: 'I file this complaint against {{employer_name}} for wage violations.\\n\\nI worked as {{position}} from {{start_date}} to {{end_date}}.\\n\\nViolations: {{violations}}.\\n\\nUnpaid wages: ${{amount}}.\\n\\nI request investigation.' },
  { type: 'inquiry', name: 'Congressional Inquiry Letter', desc: 'Letter requesting congressional office assistance', subject: 'Request for Assistance - {{constituent_name}}', body: 'Dear {{representative_name}},\\n\\nI am your constituent and I need assistance with {{agency_name}} regarding {{issue}}.\\n\\nI have been waiting since {{date}} and {{status}}.\\n\\nPlease intervene on my behalf.\\n\\nSincerely,\\n{{constituent_name}}' },
  { type: 'inquiry', name: 'Agency Status Inquiry', desc: 'Status inquiry to government agency', subject: 'Status Inquiry - Case/Application {{reference_number}}', body: 'Dear {{agency_name}},\\n\\nI am writing to inquire about the status of {{case_type}} reference {{reference_number}} filed on {{filing_date}}.\\n\\nPlease provide an update.\\n\\nSincerely,\\n{{applicant_name}}' },
];

for (const t of templateData) {
  tid++;
  templates.push([tid, t.name, t.type, t.desc, t.subject, t.body, 'active', now, now]);
}

await safeInsert('lumensend_templates',
  ['id', 'name', 'type', 'description', 'subject_template', 'body_template', 'status', 'created_at', 'updated_at'],
  templates, 'LumenSend Templates');

// ============================================================
// 9. ADVOCACY TARGETS — Need ~50 to hit target of 50
// ============================================================
console.log('\n9. Seeding Advocacy Targets...');

const advocacyTargets = [];
let atid = 200;

const targetData = [
  { name: 'U.S. Department of Labor', type: 'federal_agency', jurisdiction: 'federal', domain: 'employment', influence: 95, contact: 'dol.gov/agencies/whd', notes: 'Wage and Hour Division - primary enforcement' },
  { name: 'EEOC', type: 'federal_agency', jurisdiction: 'federal', domain: 'employment', influence: 95, contact: 'eeoc.gov', notes: 'Employment discrimination enforcement' },
  { name: 'HUD Office of Fair Housing', type: 'federal_agency', jurisdiction: 'federal', domain: 'housing', influence: 90, contact: 'hud.gov/program_offices/fair_housing_equal_opp', notes: 'Fair housing enforcement' },
  { name: 'CFPB', type: 'federal_agency', jurisdiction: 'federal', domain: 'consumer', influence: 90, contact: 'consumerfinance.gov', notes: 'Consumer financial protection' },
  { name: 'FTC', type: 'federal_agency', jurisdiction: 'federal', domain: 'consumer', influence: 85, contact: 'ftc.gov', notes: 'Consumer protection and antitrust' },
  { name: 'OSHA', type: 'federal_agency', jurisdiction: 'federal', domain: 'employment', influence: 85, contact: 'osha.gov', notes: 'Workplace safety enforcement' },
  { name: 'SSA Office of Hearings', type: 'federal_agency', jurisdiction: 'federal', domain: 'benefits', influence: 80, contact: 'ssa.gov/appeals', notes: 'Disability benefits appeals' },
  { name: 'DOJ Civil Rights Division', type: 'federal_agency', jurisdiction: 'federal', domain: 'civil_rights', influence: 95, contact: 'justice.gov/crt', notes: 'Federal civil rights enforcement' },
  { name: 'EPA Environmental Justice', type: 'federal_agency', jurisdiction: 'federal', domain: 'environmental', influence: 75, contact: 'epa.gov/environmentaljustice', notes: 'Environmental justice office' },
  { name: 'NLRB', type: 'federal_agency', jurisdiction: 'federal', domain: 'employment', influence: 85, contact: 'nlrb.gov', notes: 'Labor relations and union rights' },
  { name: 'WA L&I', type: 'state_agency', jurisdiction: 'WA', domain: 'employment', influence: 80, contact: 'lni.wa.gov', notes: 'WA labor standards enforcement' },
  { name: 'WA Attorney General CPD', type: 'state_agency', jurisdiction: 'WA', domain: 'consumer', influence: 85, contact: 'atg.wa.gov/consumer-issues', notes: 'WA consumer protection division' },
  { name: 'WA Human Rights Commission', type: 'state_agency', jurisdiction: 'WA', domain: 'civil_rights', influence: 80, contact: 'hum.wa.gov', notes: 'WA discrimination complaints' },
  { name: 'CA DLSE', type: 'state_agency', jurisdiction: 'CA', domain: 'employment', influence: 85, contact: 'dir.ca.gov/dlse', notes: 'CA labor standards enforcement' },
  { name: 'CA DFEH', type: 'state_agency', jurisdiction: 'CA', domain: 'civil_rights', influence: 85, contact: 'calcivilrights.ca.gov', notes: 'CA civil rights department' },
  { name: 'NY Attorney General', type: 'state_agency', jurisdiction: 'NY', domain: 'consumer', influence: 90, contact: 'ag.ny.gov', notes: 'NY AG consumer protection' },
  { name: 'TX Workforce Commission', type: 'state_agency', jurisdiction: 'TX', domain: 'employment', influence: 75, contact: 'twc.texas.gov', notes: 'TX employment agency' },
  { name: 'IL Department of Labor', type: 'state_agency', jurisdiction: 'IL', domain: 'employment', influence: 75, contact: 'illinois.gov/idol', notes: 'IL labor standards' },
  { name: 'National Employment Law Project', type: 'advocacy_org', jurisdiction: 'federal', domain: 'employment', influence: 85, contact: 'nelp.org', notes: 'Worker rights advocacy' },
  { name: 'National Housing Law Project', type: 'advocacy_org', jurisdiction: 'federal', domain: 'housing', influence: 80, contact: 'nhlp.org', notes: 'Housing rights advocacy' },
  { name: 'National Consumer Law Center', type: 'advocacy_org', jurisdiction: 'federal', domain: 'consumer', influence: 85, contact: 'nclc.org', notes: 'Consumer protection advocacy' },
  { name: 'ACLU', type: 'advocacy_org', jurisdiction: 'federal', domain: 'civil_rights', influence: 95, contact: 'aclu.org', notes: 'Civil liberties advocacy' },
  { name: 'Legal Aid Society', type: 'advocacy_org', jurisdiction: 'NY', domain: 'general', influence: 85, contact: 'legalaidnyc.org', notes: 'NYC legal services' },
  { name: 'Northwest Justice Project', type: 'advocacy_org', jurisdiction: 'WA', domain: 'general', influence: 80, contact: 'nwjustice.org', notes: 'WA legal aid' },
  { name: 'Legal Aid Foundation of LA', type: 'advocacy_org', jurisdiction: 'CA', domain: 'general', influence: 80, contact: 'lafla.org', notes: 'LA legal aid' },
  { name: 'Center for Disability Rights', type: 'advocacy_org', jurisdiction: 'federal', domain: 'disability', influence: 75, contact: 'cdrnys.org', notes: 'Disability rights advocacy' },
  { name: 'National Immigration Law Center', type: 'advocacy_org', jurisdiction: 'federal', domain: 'immigration', influence: 80, contact: 'nilc.org', notes: 'Immigration legal advocacy' },
  { name: 'Disability Rights Advocates', type: 'advocacy_org', jurisdiction: 'federal', domain: 'disability', influence: 80, contact: 'dralegal.org', notes: 'Disability rights litigation' },
  { name: 'Public Citizen', type: 'advocacy_org', jurisdiction: 'federal', domain: 'consumer', influence: 75, contact: 'citizen.org', notes: 'Consumer and government accountability' },
  { name: 'Southern Poverty Law Center', type: 'advocacy_org', jurisdiction: 'federal', domain: 'civil_rights', influence: 90, contact: 'splcenter.org', notes: 'Civil rights litigation and monitoring' },
  { name: 'Senate HELP Committee', type: 'legislative', jurisdiction: 'federal', domain: 'employment', influence: 90, contact: 'help.senate.gov', notes: 'Health Education Labor Pensions' },
  { name: 'House Education & Labor Committee', type: 'legislative', jurisdiction: 'federal', domain: 'employment', influence: 85, contact: 'edlabor.house.gov', notes: 'House labor committee' },
  { name: 'Senate Judiciary Committee', type: 'legislative', jurisdiction: 'federal', domain: 'civil_rights', influence: 90, contact: 'judiciary.senate.gov', notes: 'Civil rights legislation oversight' },
  { name: 'House Financial Services Committee', type: 'legislative', jurisdiction: 'federal', domain: 'consumer', influence: 85, contact: 'financialservices.house.gov', notes: 'Consumer financial legislation' },
  { name: 'Senate Banking Committee', type: 'legislative', jurisdiction: 'federal', domain: 'consumer', influence: 85, contact: 'banking.senate.gov', notes: 'Banking and consumer protection' },
  { name: 'WA Senate Labor Committee', type: 'legislative', jurisdiction: 'WA', domain: 'employment', influence: 70, contact: 'leg.wa.gov', notes: 'WA state labor legislation' },
  { name: 'CA Assembly Labor Committee', type: 'legislative', jurisdiction: 'CA', domain: 'employment', influence: 75, contact: 'assembly.ca.gov', notes: 'CA state labor legislation' },
  { name: 'NY Senate Labor Committee', type: 'legislative', jurisdiction: 'NY', domain: 'employment', influence: 75, contact: 'nysenate.gov', notes: 'NY state labor legislation' },
  { name: 'ProPublica', type: 'media', jurisdiction: 'federal', domain: 'general', influence: 85, contact: 'propublica.org/tips', notes: 'Investigative journalism' },
  { name: 'The Marshall Project', type: 'media', jurisdiction: 'federal', domain: 'civil_rights', influence: 80, contact: 'themarshallproject.org', notes: 'Criminal justice reporting' },
  { name: 'Reveal News', type: 'media', jurisdiction: 'federal', domain: 'general', influence: 75, contact: 'revealnews.org', notes: 'Investigative reporting' },
  { name: 'Seattle Times Investigations', type: 'media', jurisdiction: 'WA', domain: 'general', influence: 70, contact: 'seattletimes.com', notes: 'WA investigative journalism' },
  { name: 'LA Times Investigations', type: 'media', jurisdiction: 'CA', domain: 'general', influence: 75, contact: 'latimes.com', notes: 'CA investigative journalism' },
  { name: 'NY Times Investigations', type: 'media', jurisdiction: 'NY', domain: 'general', influence: 90, contact: 'nytimes.com/tips', notes: 'National investigative journalism' },
  { name: 'Washington Post Investigations', type: 'media', jurisdiction: 'federal', domain: 'general', influence: 90, contact: 'washingtonpost.com/tips', notes: 'National investigative journalism' },
  { name: 'NPR Investigations', type: 'media', jurisdiction: 'federal', domain: 'general', influence: 80, contact: 'npr.org', notes: 'Public radio investigations' },
  { name: 'Center for Investigative Reporting', type: 'media', jurisdiction: 'federal', domain: 'general', influence: 75, contact: 'revealnews.org', notes: 'Nonprofit investigative journalism' },
  { name: 'Politico', type: 'media', jurisdiction: 'federal', domain: 'policy', influence: 80, contact: 'politico.com', notes: 'Policy and political reporting' },
];

for (const t of targetData) {
  atid++;
  advocacyTargets.push([atid, t.name, t.type, t.jurisdiction, t.domain, t.influence, t.contact, t.notes, now, now]);
}

await safeInsert('advocacy_targets',
  ['id', 'name', 'type', 'jurisdiction', 'domain', 'influence_score', 'contact_info', 'notes', 'created_at', 'updated_at'],
  advocacyTargets, 'Advocacy Targets');

// ============================================================
// 10. WORKFLOWS — Need ~39 more to hit target of 100
// ============================================================
console.log('\n10. Seeding Workflows...');

const workflows = [];
let wid = 200;

const workflowData = [
  { name: 'Wage Theft Investigation', domain: 'employment', claim: 'wage_theft', desc: 'Full workflow for investigating and pursuing wage theft claims', steps: JSON.stringify(['Gather pay stubs and records', 'Calculate unpaid wages', 'Send demand letter', 'File DOL complaint', 'File state complaint', 'Pursue litigation if needed']) },
  { name: 'EEOC Discrimination Charge', domain: 'employment', claim: 'employment_discrimination', desc: 'File and pursue EEOC discrimination charge', steps: JSON.stringify(['Document discriminatory acts', 'File EEOC charge', 'Cooperate with investigation', 'Receive right-to-sue letter', 'File federal lawsuit']) },
  { name: 'Fair Housing Complaint', domain: 'housing', claim: 'housing_discrimination', desc: 'File and pursue fair housing complaint', steps: JSON.stringify(['Document discrimination', 'File HUD complaint', 'Cooperate with investigation', 'Conciliation or litigation']) },
  { name: 'SSDI Application', domain: 'benefits', claim: 'ssdi', desc: 'Apply for SSDI benefits', steps: JSON.stringify(['Gather medical records', 'Complete application', 'Submit to SSA', 'Respond to requests', 'Appeal if denied']) },
  { name: 'Wrongful Termination Claim', domain: 'employment', claim: 'wrongful_termination', desc: 'Pursue wrongful termination claim', steps: JSON.stringify(['Document termination circumstances', 'Identify legal basis', 'File administrative complaint', 'Negotiate settlement', 'File lawsuit']) },
  { name: 'ADA Accommodation Request', domain: 'disability', claim: 'ada_accommodation', desc: 'Request reasonable accommodation under ADA', steps: JSON.stringify(['Document disability', 'Submit accommodation request', 'Engage in interactive process', 'File EEOC charge if denied']) },
  { name: 'Tenant Rights Defense', domain: 'housing', claim: 'tenant_rights', desc: 'Defend tenant rights against landlord violations', steps: JSON.stringify(['Document violations', 'Send notice to landlord', 'Contact local housing authority', 'File complaint', 'Pursue legal remedies']) },
  { name: 'Workers Compensation Claim', domain: 'employment', claim: 'workers_comp', desc: 'File and pursue workers compensation claim', steps: JSON.stringify(['Report injury', 'Seek medical treatment', 'File claim', 'Cooperate with investigation', 'Appeal if denied']) },
  { name: 'Consumer Fraud Investigation', domain: 'consumer', claim: 'consumer_fraud', desc: 'Investigate and pursue consumer fraud claims', steps: JSON.stringify(['Document fraudulent practices', 'File CFPB complaint', 'File state AG complaint', 'Pursue private action']) },
  { name: 'Section 1983 Civil Rights', domain: 'civil_rights', claim: 'section_1983', desc: 'Pursue Section 1983 civil rights claim', steps: JSON.stringify(['Document rights violation', 'Identify state actors', 'File federal complaint', 'Discovery', 'Trial or settlement']) },
  { name: 'Unemployment Benefits Appeal', domain: 'benefits', claim: 'unemployment', desc: 'Appeal unemployment benefits denial', steps: JSON.stringify(['Review denial letter', 'Gather evidence', 'File appeal', 'Prepare for hearing', 'Attend hearing']) },
  { name: 'FDCPA Debt Collection Defense', domain: 'consumer', claim: 'debt_collection', desc: 'Defend against illegal debt collection practices', steps: JSON.stringify(['Document violations', 'Send validation request', 'Send cease and desist', 'File CFPB complaint', 'File lawsuit']) },
  { name: 'Police Misconduct Complaint', domain: 'civil_rights', claim: 'police_misconduct', desc: 'File police misconduct complaint', steps: JSON.stringify(['Document incident', 'File internal affairs complaint', 'File civilian review complaint', 'File DOJ complaint', 'Pursue Section 1983 claim']) },
  { name: 'Medicaid Application', domain: 'benefits', claim: 'medicaid', desc: 'Apply for Medicaid benefits', steps: JSON.stringify(['Determine eligibility', 'Gather documentation', 'Submit application', 'Respond to requests', 'Appeal if denied']) },
  { name: 'SNAP Benefits Appeal', domain: 'benefits', claim: 'snap', desc: 'Appeal SNAP benefits denial or reduction', steps: JSON.stringify(['Review determination', 'Request fair hearing', 'Gather evidence', 'Attend hearing', 'Appeal to court if needed']) },
  { name: 'Sexual Harassment Claim', domain: 'employment', claim: 'sexual_harassment', desc: 'Pursue sexual harassment claim', steps: JSON.stringify(['Document harassment', 'Report to employer', 'File EEOC charge', 'Cooperate with investigation', 'Pursue litigation']) },
  { name: 'Whistleblower Protection', domain: 'employment', claim: 'whistleblower', desc: 'Protect whistleblower rights', steps: JSON.stringify(['Document protected activity', 'Document retaliation', 'File OSHA complaint', 'File qui tam if applicable', 'Pursue anti-retaliation claim']) },
  { name: 'Immigration Asylum Application', domain: 'immigration', claim: 'asylum', desc: 'Apply for asylum protection', steps: JSON.stringify(['Document persecution', 'File I-589', 'Attend interview', 'Prepare for hearing', 'Appeal if denied']) },
  { name: 'Veterans Benefits Claim', domain: 'benefits', claim: 'veterans_benefits', desc: 'File veterans benefits claim', steps: JSON.stringify(['Gather service records', 'Obtain medical evidence', 'File VA claim', 'Attend C&P exam', 'Appeal if denied']) },
  { name: 'Predatory Lending Defense', domain: 'consumer', claim: 'predatory_lending', desc: 'Defend against predatory lending', steps: JSON.stringify(['Review loan documents', 'Identify violations', 'File CFPB complaint', 'File state complaint', 'Pursue rescission or damages']) },
  { name: 'Environmental Justice Complaint', domain: 'environmental', claim: 'environmental_justice', desc: 'File environmental justice complaint', steps: JSON.stringify(['Document environmental harm', 'File EPA complaint', 'File Title VI complaint', 'Engage community', 'Pursue legal remedies']) },
  { name: 'Disability Benefits SSI', domain: 'benefits', claim: 'ssi', desc: 'Apply for SSI disability benefits', steps: JSON.stringify(['Determine eligibility', 'Gather medical records', 'Submit application', 'Attend consultative exam', 'Appeal if denied']) },
  { name: 'Eviction Defense', domain: 'housing', claim: 'eviction_defense', desc: 'Defend against wrongful eviction', steps: JSON.stringify(['Review eviction notice', 'Identify defenses', 'File answer', 'Attend hearing', 'Negotiate or appeal']) },
  { name: 'Wage Garnishment Defense', domain: 'consumer', claim: 'wage_garnishment', desc: 'Defend against excessive wage garnishment', steps: JSON.stringify(['Review garnishment order', 'Calculate exemptions', 'File claim of exemption', 'Attend hearing', 'Negotiate payment plan']) },
  { name: 'FMLA Leave Protection', domain: 'employment', claim: 'fmla', desc: 'Protect FMLA leave rights', steps: JSON.stringify(['Document qualifying condition', 'Submit FMLA request', 'Document employer response', 'File DOL complaint if denied', 'Pursue litigation']) },
  { name: 'Title IX Education Complaint', domain: 'civil_rights', claim: 'title_ix', desc: 'File Title IX education discrimination complaint', steps: JSON.stringify(['Document discrimination', 'File school complaint', 'File OCR complaint', 'Cooperate with investigation', 'Pursue legal remedies']) },
  { name: 'ADA Title III Access', domain: 'disability', claim: 'ada_title_iii', desc: 'Pursue ADA Title III public accommodation claim', steps: JSON.stringify(['Document barriers', 'Send demand letter', 'File DOJ complaint', 'File lawsuit', 'Monitor compliance']) },
  { name: 'Foreclosure Defense', domain: 'housing', claim: 'foreclosure_defense', desc: 'Defend against wrongful foreclosure', steps: JSON.stringify(['Review mortgage documents', 'Identify violations', 'Request mediation', 'File answer', 'Pursue loss mitigation']) },
  { name: 'Retaliation Claim', domain: 'employment', claim: 'retaliation', desc: 'Pursue workplace retaliation claim', steps: JSON.stringify(['Document protected activity', 'Document adverse action', 'Establish causal connection', 'File agency complaint', 'Pursue litigation']) },
  { name: 'Fair Credit Reporting', domain: 'consumer', claim: 'fcra', desc: 'Pursue FCRA credit reporting violations', steps: JSON.stringify(['Obtain credit reports', 'Identify errors', 'Dispute with bureaus', 'Dispute with furnishers', 'File lawsuit if unresolved']) },
  { name: 'Domestic Violence Protection', domain: 'civil_rights', claim: 'domestic_violence', desc: 'Obtain domestic violence protection', steps: JSON.stringify(['Document abuse', 'File for protective order', 'Attend hearing', 'Enforce order', 'Access support services']) },
  { name: 'Public Benefits Appeal', domain: 'benefits', claim: 'public_benefits', desc: 'Appeal public benefits denial', steps: JSON.stringify(['Review denial notice', 'Identify appeal rights', 'Gather evidence', 'Request fair hearing', 'Attend hearing']) },
  { name: 'Nursing Home Abuse', domain: 'elder_law', claim: 'nursing_home_abuse', desc: 'Pursue nursing home abuse claim', steps: JSON.stringify(['Document abuse or neglect', 'Report to state agency', 'File complaint', 'Preserve evidence', 'Pursue legal action']) },
  { name: 'Student Loan Defense', domain: 'consumer', claim: 'student_loan', desc: 'Defend against student loan issues', steps: JSON.stringify(['Review loan terms', 'Apply for income-driven repayment', 'Apply for forgiveness programs', 'File borrower defense', 'Dispute if fraud']) },
  { name: 'Immigration DACA Renewal', domain: 'immigration', claim: 'daca', desc: 'Renew DACA status', steps: JSON.stringify(['Check eligibility', 'Gather documentation', 'Complete I-821D', 'Submit application', 'Track status']) },
  { name: 'Workplace Safety Complaint', domain: 'employment', claim: 'workplace_safety', desc: 'File workplace safety complaint', steps: JSON.stringify(['Document hazards', 'Report to employer', 'File OSHA complaint', 'Cooperate with inspection', 'Protect against retaliation']) },
  { name: 'Insurance Claim Denial', domain: 'consumer', claim: 'insurance_denial', desc: 'Appeal insurance claim denial', steps: JSON.stringify(['Review denial letter', 'Gather supporting evidence', 'File internal appeal', 'File external review', 'File state insurance complaint']) },
  { name: 'Employment Contract Dispute', domain: 'employment', claim: 'contract_dispute', desc: 'Resolve employment contract dispute', steps: JSON.stringify(['Review contract terms', 'Document breach', 'Send demand letter', 'Attempt mediation', 'File lawsuit']) },
  { name: 'Privacy Rights Violation', domain: 'consumer', claim: 'privacy', desc: 'Pursue privacy rights violation', steps: JSON.stringify(['Document violation', 'File FTC complaint', 'File state AG complaint', 'Pursue private action', 'Seek injunctive relief']) },
];

for (const w of workflowData) {
  wid++;
  workflows.push([wid, w.name, w.domain, w.claim, w.desc, w.steps, 'active', now, now]);
}

await safeInsert('workflows',
  ['id', 'name', 'domain', 'claim_type', 'description', 'steps', 'status', 'created_at', 'updated_at'],
  workflows, 'Workflows');

// ============================================================
// 11. COURT DIRECTORY — Need ~52 more to hit target of 200
// ============================================================
console.log('\n11. Seeding Court Directory...');

const courts = [];
let ctid = 500;

const courtData = [
  { name: 'U.S. District Court - Western District of Washington', type: 'federal_district', jurisdiction: 'WA', address: '700 Stewart St, Seattle, WA 98101', phone: '206-370-8400', website: 'wawd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Seattle division' },
  { name: 'U.S. District Court - Eastern District of Washington', type: 'federal_district', jurisdiction: 'WA', address: '920 W Riverside Ave, Spokane, WA 99201', phone: '509-458-3400', website: 'waed.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Spokane division' },
  { name: 'U.S. District Court - Central District of California', type: 'federal_district', jurisdiction: 'CA', address: '350 W 1st St, Los Angeles, CA 90012', phone: '213-894-1565', website: 'cacd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Los Angeles division' },
  { name: 'U.S. District Court - Northern District of California', type: 'federal_district', jurisdiction: 'CA', address: '450 Golden Gate Ave, San Francisco, CA 94102', phone: '415-522-2000', website: 'cand.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'San Francisco division' },
  { name: 'U.S. District Court - Southern District of New York', type: 'federal_district', jurisdiction: 'NY', address: '500 Pearl St, New York, NY 10007', phone: '212-805-0136', website: 'nysd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Manhattan division' },
  { name: 'U.S. District Court - Eastern District of New York', type: 'federal_district', jurisdiction: 'NY', address: '225 Cadman Plaza E, Brooklyn, NY 11201', phone: '718-613-2600', website: 'nyed.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Brooklyn division' },
  { name: 'U.S. District Court - Northern District of Texas', type: 'federal_district', jurisdiction: 'TX', address: '1100 Commerce St, Dallas, TX 75242', phone: '214-753-2200', website: 'txnd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Dallas division' },
  { name: 'U.S. District Court - Northern District of Illinois', type: 'federal_district', jurisdiction: 'IL', address: '219 S Dearborn St, Chicago, IL 60604', phone: '312-435-5670', website: 'ilnd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Chicago division' },
  { name: 'U.S. District Court - District of Minnesota', type: 'federal_district', jurisdiction: 'MN', address: '300 S 4th St, Minneapolis, MN 55415', phone: '612-664-5000', website: 'mnd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Minneapolis division' },
  { name: 'U.S. District Court - Eastern District of Michigan', type: 'federal_district', jurisdiction: 'MI', address: '231 W Lafayette Blvd, Detroit, MI 48226', phone: '313-234-5005', website: 'mied.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Detroit division' },
  { name: 'U.S. Court of Appeals - Ninth Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '95 7th St, San Francisco, CA 94103', phone: '415-355-8000', website: 'ca9.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers AK, AZ, CA, HI, ID, MT, NV, OR, WA' },
  { name: 'U.S. Court of Appeals - Second Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '40 Foley Square, New York, NY 10007', phone: '212-857-8500', website: 'ca2.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers CT, NY, VT' },
  { name: 'U.S. Court of Appeals - Fifth Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '600 S Maestri Pl, New Orleans, LA 70130', phone: '504-310-7700', website: 'ca5.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers LA, MS, TX' },
  { name: 'U.S. Court of Appeals - Seventh Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '219 S Dearborn St, Chicago, IL 60604', phone: '312-435-5850', website: 'ca7.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers IL, IN, WI' },
  { name: 'U.S. Court of Appeals - Eighth Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '111 S 10th St, St. Louis, MO 63102', phone: '314-244-2400', website: 'ca8.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers AR, IA, MN, MO, NE, ND, SD' },
  { name: 'King County Superior Court', type: 'state_trial', jurisdiction: 'WA', address: '516 3rd Ave, Seattle, WA 98104', phone: '206-477-1400', website: 'kingcounty.gov/courts/superior-court', efiling: 'linxonline.co.king.wa.us', notes: 'WA general jurisdiction trial court' },
  { name: 'King County District Court', type: 'state_limited', jurisdiction: 'WA', address: '516 3rd Ave, Seattle, WA 98104', phone: '206-205-2000', website: 'kingcounty.gov/courts/district-court', efiling: 'linxonline.co.king.wa.us', notes: 'WA limited jurisdiction' },
  { name: 'LA County Superior Court', type: 'state_trial', jurisdiction: 'CA', address: '111 N Hill St, Los Angeles, CA 90012', phone: '213-830-0803', website: 'lacourt.org', efiling: 'my.lacourt.org', notes: 'CA general jurisdiction trial court' },
  { name: 'San Francisco Superior Court', type: 'state_trial', jurisdiction: 'CA', address: '400 McAllister St, San Francisco, CA 94102', phone: '415-551-4000', website: 'sfsuperiorcourt.org', efiling: 'sfsuperiorcourt.org/online-services', notes: 'SF trial court' },
  { name: 'New York Supreme Court - Manhattan', type: 'state_trial', jurisdiction: 'NY', address: '60 Centre St, New York, NY 10007', phone: '646-386-3600', website: 'nycourts.gov', efiling: 'nycourts.gov/efile', notes: 'NY general jurisdiction trial court' },
  { name: 'New York Civil Court', type: 'state_limited', jurisdiction: 'NY', address: '111 Centre St, New York, NY 10013', phone: '646-386-5700', website: 'nycourts.gov/courts/nyc/civil', efiling: 'nycourts.gov/efile', notes: 'NYC civil court' },
  { name: 'Cook County Circuit Court', type: 'state_trial', jurisdiction: 'IL', address: '50 W Washington St, Chicago, IL 60602', phone: '312-603-5030', website: 'cookcountycourt.org', efiling: 'cookcountyclerkofcourt.org', notes: 'IL trial court - Chicago' },
  { name: 'Harris County District Court', type: 'state_trial', jurisdiction: 'TX', address: '201 Caroline St, Houston, TX 77002', phone: '832-927-5800', website: 'justex.net', efiling: 'efiletexas.gov', notes: 'TX trial court - Houston' },
  { name: 'Dallas County District Court', type: 'state_trial', jurisdiction: 'TX', address: '600 Commerce St, Dallas, TX 75202', phone: '214-653-7301', website: 'dallascounty.org', efiling: 'efiletexas.gov', notes: 'TX trial court - Dallas' },
  { name: 'Hennepin County District Court', type: 'state_trial', jurisdiction: 'MN', address: '300 S 6th St, Minneapolis, MN 55487', phone: '612-348-2040', website: 'mncourts.gov', efiling: 'mncourts.gov/efile', notes: 'MN trial court - Minneapolis' },
  { name: 'Wayne County Circuit Court', type: 'state_trial', jurisdiction: 'MI', address: '2 Woodward Ave, Detroit, MI 48226', phone: '313-224-5261', website: 'wcccf.org', efiling: 'courts.michigan.gov', notes: 'MI trial court - Detroit' },
  { name: 'WA Board of Industrial Insurance Appeals', type: 'administrative', jurisdiction: 'WA', address: '2430 Chandler Ct SW, Olympia, WA 98504', phone: '360-753-9646', website: 'biia.wa.gov', efiling: 'biia.wa.gov', notes: 'WA workers comp appeals' },
  { name: 'WA Employment Security Appeals', type: 'administrative', jurisdiction: 'WA', address: 'PO Box 9555, Olympia, WA 98507', phone: '800-318-6022', website: 'esd.wa.gov', efiling: 'esd.wa.gov', notes: 'WA unemployment appeals' },
  { name: 'CA Workers Compensation Appeals Board', type: 'administrative', jurisdiction: 'CA', address: '455 Golden Gate Ave, San Francisco, CA 94102', phone: '415-703-4600', website: 'dir.ca.gov/wcab', efiling: 'dir.ca.gov/eams', notes: 'CA workers comp appeals' },
  { name: 'EEOC Administrative Hearing', type: 'administrative', jurisdiction: 'federal', address: '131 M St NE, Washington, DC 20507', phone: '800-669-4000', website: 'eeoc.gov', efiling: 'eeoc.gov/filing-charge', notes: 'Federal employment discrimination' },
  { name: 'Social Security ODAR', type: 'administrative', jurisdiction: 'federal', address: 'Various locations', phone: '800-772-1213', website: 'ssa.gov/appeals', efiling: 'ssa.gov/appeals', notes: 'SSA disability hearings' },
  { name: 'U.S. Tax Court', type: 'federal_specialized', jurisdiction: 'federal', address: '400 2nd St NW, Washington, DC 20217', phone: '202-521-0700', website: 'ustaxcourt.gov', efiling: 'ustaxcourt.gov', notes: 'Federal tax disputes' },
  { name: 'U.S. Bankruptcy Court - WD Washington', type: 'federal_specialized', jurisdiction: 'WA', address: '700 Stewart St, Seattle, WA 98101', phone: '206-370-5340', website: 'wawb.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'WA bankruptcy court' },
  { name: 'U.S. Bankruptcy Court - CD California', type: 'federal_specialized', jurisdiction: 'CA', address: '255 E Temple St, Los Angeles, CA 90012', phone: '213-894-3118', website: 'cacb.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'CA bankruptcy court' },
  { name: 'U.S. Bankruptcy Court - SD New York', type: 'federal_specialized', jurisdiction: 'NY', address: '1 Bowling Green, New York, NY 10004', phone: '212-668-2870', website: 'nysb.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'NY bankruptcy court' },
  { name: 'WA Court of Appeals - Division I', type: 'state_appellate', jurisdiction: 'WA', address: '600 University St, Seattle, WA 98101', phone: '206-464-7750', website: 'courts.wa.gov', efiling: 'courts.wa.gov', notes: 'WA appellate - Seattle' },
  { name: 'CA Court of Appeal - Second District', type: 'state_appellate', jurisdiction: 'CA', address: '300 S Spring St, Los Angeles, CA 90013', phone: '213-830-7000', website: 'courts.ca.gov', efiling: 'courts.ca.gov', notes: 'CA appellate - LA' },
  { name: 'NY Appellate Division - First Department', type: 'state_appellate', jurisdiction: 'NY', address: '27 Madison Ave, New York, NY 10010', phone: '212-340-0400', website: 'nycourts.gov', efiling: 'nycourts.gov/efile', notes: 'NY appellate - Manhattan' },
  { name: 'IL Appellate Court - First District', type: 'state_appellate', jurisdiction: 'IL', address: '160 N LaSalle St, Chicago, IL 60601', phone: '312-793-5415', website: 'illinoiscourts.gov', efiling: 'illinoiscourts.gov', notes: 'IL appellate - Chicago' },
  { name: 'TX Court of Appeals - Fifth District', type: 'state_appellate', jurisdiction: 'TX', address: '600 Commerce St, Dallas, TX 75202', phone: '214-712-3400', website: 'txcourts.gov', efiling: 'efiletexas.gov', notes: 'TX appellate - Dallas' },
  { name: 'MN Court of Appeals', type: 'state_appellate', jurisdiction: 'MN', address: '305 Minnesota Judicial Center, St. Paul, MN 55155', phone: '651-296-2581', website: 'mncourts.gov', efiling: 'mncourts.gov/efile', notes: 'MN appellate court' },
  { name: 'MI Court of Appeals', type: 'state_appellate', jurisdiction: 'MI', address: '925 W Ottawa St, Lansing, MI 48915', phone: '517-373-0786', website: 'courts.michigan.gov', efiling: 'courts.michigan.gov', notes: 'MI appellate court' },
  { name: 'FL Circuit Court - Miami-Dade', type: 'state_trial', jurisdiction: 'FL', address: '73 W Flagler St, Miami, FL 33130', phone: '305-349-7001', website: 'jud11.flcourts.org', efiling: 'myflcourtaccess.com', notes: 'FL trial court - Miami' },
  { name: 'FL District Court of Appeal - Third District', type: 'state_appellate', jurisdiction: 'FL', address: '2001 SW 117th Ave, Miami, FL 33175', phone: '305-229-3200', website: '3dca.flcourts.org', efiling: 'edca.3dca.flcourts.org', notes: 'FL appellate - Miami' },
  { name: 'U.S. District Court - Southern District of Florida', type: 'federal_district', jurisdiction: 'FL', address: '400 N Miami Ave, Miami, FL 33128', phone: '305-523-5100', website: 'flsd.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Miami division' },
  { name: 'U.S. Court of Appeals - Eleventh Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '56 Forsyth St NW, Atlanta, GA 30303', phone: '404-335-6100', website: 'ca11.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers AL, FL, GA' },
  { name: 'U.S. Court of Appeals - Sixth Circuit', type: 'federal_appellate', jurisdiction: 'federal', address: '540 Potter Stewart US Courthouse, Cincinnati, OH 45202', phone: '513-564-7000', website: 'ca6.uscourts.gov', efiling: 'pacer.uscourts.gov', notes: 'Covers KY, MI, OH, TN' },
  { name: 'Pierce County Superior Court', type: 'state_trial', jurisdiction: 'WA', address: '930 Tacoma Ave S, Tacoma, WA 98402', phone: '253-798-7455', website: 'piercecountywa.gov', efiling: 'linxonline.co.pierce.wa.us', notes: 'WA trial court - Tacoma' },
  { name: 'Snohomish County Superior Court', type: 'state_trial', jurisdiction: 'WA', address: '3000 Rockefeller Ave, Everett, WA 98201', phone: '425-388-3421', website: 'snohomishcountywa.gov', efiling: 'snohomishcountywa.gov', notes: 'WA trial court - Everett' },
  { name: 'San Diego Superior Court', type: 'state_trial', jurisdiction: 'CA', address: '1100 Union St, San Diego, CA 92101', phone: '619-450-7072', website: 'sdcourt.ca.gov', efiling: 'sdcourt.ca.gov', notes: 'CA trial court - San Diego' },
  { name: 'Sacramento Superior Court', type: 'state_trial', jurisdiction: 'CA', address: '720 9th St, Sacramento, CA 95814', phone: '916-874-5522', website: 'saccourt.ca.gov', efiling: 'saccourt.ca.gov', notes: 'CA trial court - Sacramento' },
  { name: 'Alameda County Superior Court', type: 'state_trial', jurisdiction: 'CA', address: '1225 Fallon St, Oakland, CA 94612', phone: '510-891-6012', website: 'alameda.courts.ca.gov', efiling: 'alameda.courts.ca.gov', notes: 'CA trial court - Oakland' },
];

for (const c of courtData) {
  ctid++;
  courts.push([ctid, c.name, c.type, c.jurisdiction, c.address, c.phone, c.website, c.efiling, c.notes, now, now]);
}

await safeInsert('court_directory',
  ['id', 'name', 'type', 'jurisdiction', 'address', 'phone', 'website', 'efiling_url', 'notes', 'created_at', 'updated_at'],
  courts, 'Court Directory');

// ============================================================
// 12. DOCTRINE REGISTRY — Need ~12 more to hit target of 100
// ============================================================
console.log('\n12. Seeding Doctrine Registry...');

const doctrines = [];
let did2 = 300;

const doctrineData = [
  { name: 'Constructive Discharge', domain: 'employment', desc: 'When working conditions are so intolerable that a reasonable person would resign', elements: JSON.stringify(['Intolerable working conditions', 'Employer knew or should have known', 'Reasonable person would resign', 'Employee actually resigned']), defenses: JSON.stringify(['Conditions were not objectively intolerable', 'Employee failed to use internal remedies', 'Employer took corrective action']) },
  { name: 'Mixed Motive', domain: 'employment', desc: 'Both legitimate and illegitimate reasons motivated adverse action', elements: JSON.stringify(['Protected characteristic was a motivating factor', 'Adverse employment action occurred', 'Causal connection between protected status and action']), defenses: JSON.stringify(['Same decision would have been made regardless', 'Legitimate non-discriminatory reason']) },
  { name: 'Continuing Violation', domain: 'civil_rights', desc: 'Series of related acts treated as one continuing violation for statute of limitations', elements: JSON.stringify(['Series of related discriminatory acts', 'At least one act within filing period', 'Acts are sufficiently related', 'Pattern of ongoing discrimination']), defenses: JSON.stringify(['Acts are discrete and unrelated', 'Employee knew of each violation when it occurred', 'Significant gap between acts']) },
  { name: 'Implied Warranty of Habitability', domain: 'housing', desc: 'Landlord must maintain rental property in habitable condition', elements: JSON.stringify(['Landlord-tenant relationship exists', 'Defective condition exists', 'Landlord had notice of defect', 'Reasonable time to repair elapsed']), defenses: JSON.stringify(['Tenant caused the damage', 'Condition does not affect habitability', 'Landlord was not notified']) },
  { name: 'Retaliatory Eviction', domain: 'housing', desc: 'Eviction motivated by tenant exercising legal rights', elements: JSON.stringify(['Tenant exercised legal right', 'Landlord took adverse action', 'Temporal proximity', 'Causal connection']), defenses: JSON.stringify(['Legitimate business reason for eviction', 'Substantial time gap', 'Pattern of non-payment']) },
  { name: 'Fraudulent Misrepresentation', domain: 'consumer', desc: 'Intentional false statement of material fact inducing reliance', elements: JSON.stringify(['False representation of material fact', 'Knowledge of falsity', 'Intent to induce reliance', 'Justifiable reliance', 'Resulting damages']), defenses: JSON.stringify(['Statement was opinion not fact', 'No justifiable reliance', 'No damages resulted']) },
  { name: 'Unconscionability', domain: 'consumer', desc: 'Contract terms so one-sided as to be unenforceable', elements: JSON.stringify(['Procedural unconscionability (unfair bargaining)', 'Substantive unconscionability (unfair terms)', 'Oppression or surprise in contract formation']), defenses: JSON.stringify(['Arms-length transaction', 'Adequate consideration', 'Party had opportunity to review']) },
  { name: 'Qualified Immunity', domain: 'civil_rights', desc: 'Government officials shielded from liability unless clearly established rights violated', elements: JSON.stringify(['Constitutional right was violated', 'Right was clearly established at time of conduct', 'Reasonable official would have known conduct violated right']), defenses: JSON.stringify(['Right was not clearly established', 'Conduct was objectively reasonable', 'No constitutional violation occurred']) },
  { name: 'Exhaustion of Administrative Remedies', domain: 'general', desc: 'Requirement to pursue all available administrative remedies before court action', elements: JSON.stringify(['Administrative remedy available', 'Plaintiff failed to pursue remedy', 'Remedy could provide adequate relief']), defenses: JSON.stringify(['Futility exception', 'Irreparable harm exception', 'Agency lacks authority to grant relief']) },
  { name: 'Substantial Gainful Activity', domain: 'benefits', desc: 'SSA standard for determining disability - inability to perform SGA', elements: JSON.stringify(['Medical condition exists', 'Condition prevents substantial gainful activity', 'Condition lasted or expected to last 12+ months', 'Cannot perform past relevant work']), defenses: JSON.stringify(['Claimant can perform SGA', 'Condition is not severe', 'Other work available in national economy']) },
  { name: 'Disparate Impact', domain: 'employment', desc: 'Facially neutral policy disproportionately affects protected group', elements: JSON.stringify(['Facially neutral policy or practice', 'Statistically significant disparate impact', 'Impact falls on protected group']), defenses: JSON.stringify(['Business necessity', 'Job-relatedness', 'Less discriminatory alternative not available']) },
  { name: 'Promissory Estoppel', domain: 'general', desc: 'Enforcement of promise when reliance makes injustice unavoidable', elements: JSON.stringify(['Clear and definite promise', 'Promisor expected reliance', 'Promisee actually relied', 'Injustice can only be avoided by enforcement']), defenses: JSON.stringify(['Promise was vague or indefinite', 'Reliance was unreasonable', 'No injustice from non-enforcement']) },
];

for (const d of doctrineData) {
  did2++;
  doctrines.push([did2, d.name, d.domain, d.desc, d.elements, d.defenses, 'active', now, now]);
}

await safeInsert('doctrine_registry',
  ['id', 'name', 'domain', 'description', 'elements', 'defenses', 'status', 'created_at', 'updated_at'],
  doctrines, 'Doctrine Registry');

// ============================================================
// 13. PROOF FRAMEWORKS — Need ~27 more to hit target of 100
// ============================================================
console.log('\n13. Seeding Proof Frameworks...');

const proofs = [];
let pid2 = 200;

const proofData = [
  { claim: 'wage_theft', name: 'Wage Theft - FLSA', burden: 'preponderance', elements: JSON.stringify(['Employment relationship exists', 'Work was performed', 'Wages were not paid', 'Amount of unpaid wages']), evidence: JSON.stringify(['Pay stubs', 'Time records', 'Employment contract', 'Bank statements', 'Witness testimony']) },
  { claim: 'employment_discrimination', name: 'Title VII Discrimination - McDonnell Douglas', burden: 'preponderance', elements: JSON.stringify(['Member of protected class', 'Qualified for position', 'Adverse employment action', 'Similarly situated employees treated differently']), evidence: JSON.stringify(['Personnel records', 'Performance reviews', 'Comparator evidence', 'Statistical data', 'Direct statements']) },
  { claim: 'sexual_harassment', name: 'Sexual Harassment - Hostile Environment', burden: 'preponderance', elements: JSON.stringify(['Unwelcome conduct', 'Based on sex', 'Severe or pervasive', 'Affected work environment', 'Employer knew or should have known']), evidence: JSON.stringify(['Incident documentation', 'Witness statements', 'HR complaints', 'Text messages', 'Email records']) },
  { claim: 'wrongful_termination', name: 'Wrongful Termination - Public Policy', burden: 'preponderance', elements: JSON.stringify(['Employment existed', 'Termination occurred', 'Protected activity preceded termination', 'Causal connection']), evidence: JSON.stringify(['Termination letter', 'Timeline of events', 'Protected activity documentation', 'Comparator evidence']) },
  { claim: 'housing_discrimination', name: 'Fair Housing Act Discrimination', burden: 'preponderance', elements: JSON.stringify(['Protected class membership', 'Applied for housing', 'Qualified for housing', 'Denied or different terms', 'Housing remained available']), evidence: JSON.stringify(['Application records', 'Correspondence', 'Testing evidence', 'Statistical data', 'Comparator evidence']) },
  { claim: 'ada_accommodation', name: 'ADA Failure to Accommodate', burden: 'preponderance', elements: JSON.stringify(['Disability exists', 'Qualified individual', 'Accommodation requested', 'Employer failed to engage in interactive process', 'Reasonable accommodation existed']), evidence: JSON.stringify(['Medical records', 'Accommodation request', 'Interactive process documentation', 'Job description', 'Expert testimony']) },
  { claim: 'retaliation', name: 'Retaliation - General Framework', burden: 'preponderance', elements: JSON.stringify(['Protected activity occurred', 'Employer knew of activity', 'Adverse action taken', 'Causal connection', 'Temporal proximity']), evidence: JSON.stringify(['Protected activity documentation', 'Timeline', 'Adverse action documentation', 'Comparator evidence', 'Employer statements']) },
  { claim: 'section_1983', name: 'Section 1983 Civil Rights', burden: 'preponderance', elements: JSON.stringify(['Action under color of state law', 'Deprivation of constitutional right', 'Causation', 'Damages']), evidence: JSON.stringify(['Incident reports', 'Body camera footage', 'Witness statements', 'Medical records', 'Policy documents']) },
  { claim: 'consumer_fraud', name: 'Consumer Fraud - State UDAP', burden: 'preponderance', elements: JSON.stringify(['Unfair or deceptive act', 'In trade or commerce', 'Affecting public interest', 'Injury to plaintiff', 'Causation']), evidence: JSON.stringify(['Advertising materials', 'Contract documents', 'Correspondence', 'Financial records', 'Expert testimony']) },
  { claim: 'ssdi', name: 'SSDI Disability - Five Step Sequential', burden: 'preponderance', elements: JSON.stringify(['Not engaged in SGA', 'Severe impairment', 'Meets or equals listing', 'Cannot perform past work', 'Cannot perform other work']), evidence: JSON.stringify(['Medical records', 'Treating physician opinions', 'Functional capacity evaluation', 'Vocational expert testimony', 'Work history']) },
  { claim: 'workers_comp', name: 'Workers Compensation Claim', burden: 'preponderance', elements: JSON.stringify(['Employment relationship', 'Injury or illness occurred', 'Arose out of employment', 'In course of employment']), evidence: JSON.stringify(['Incident report', 'Medical records', 'Witness statements', 'Job description', 'Safety records']) },
  { claim: 'debt_collection', name: 'FDCPA Violation', burden: 'preponderance', elements: JSON.stringify(['Defendant is debt collector', 'Communication regarding debt', 'Violation of FDCPA provision', 'Damages']), evidence: JSON.stringify(['Collection letters', 'Phone records', 'Voicemail recordings', 'Credit reports', 'Validation requests']) },
  { claim: 'tenant_rights', name: 'Breach of Warranty of Habitability', burden: 'preponderance', elements: JSON.stringify(['Landlord-tenant relationship', 'Defective condition exists', 'Notice to landlord', 'Failure to repair in reasonable time', 'Damages']), evidence: JSON.stringify(['Lease agreement', 'Inspection reports', 'Photos/videos', 'Repair requests', 'Health department records']) },
  { claim: 'police_misconduct', name: 'Excessive Force - Fourth Amendment', burden: 'preponderance', elements: JSON.stringify(['Seizure occurred', 'Force was used', 'Force was objectively unreasonable', 'Under totality of circumstances']), evidence: JSON.stringify(['Body camera footage', 'Dash camera footage', 'Witness statements', 'Medical records', 'Use of force reports']) },
  { claim: 'whistleblower', name: 'Whistleblower Retaliation', burden: 'preponderance', elements: JSON.stringify(['Protected disclosure made', 'Employer knew of disclosure', 'Adverse action taken', 'Contributing factor', 'Temporal proximity']), evidence: JSON.stringify(['Disclosure documentation', 'Timeline', 'Performance records before/after', 'Comparator evidence', 'Internal communications']) },
  { claim: 'predatory_lending', name: 'Predatory Lending - TILA/RESPA', burden: 'preponderance', elements: JSON.stringify(['Lending transaction occurred', 'Material disclosure violation', 'Unfair or deceptive terms', 'Borrower harm']), evidence: JSON.stringify(['Loan documents', 'Disclosure statements', 'Appraisal records', 'Payment history', 'Expert analysis']) },
  { claim: 'fmla', name: 'FMLA Interference/Retaliation', burden: 'preponderance', elements: JSON.stringify(['Eligible employee', 'Qualifying reason for leave', 'Notice provided', 'Employer denied or interfered', 'Damages']), evidence: JSON.stringify(['FMLA request', 'Medical certification', 'Employer response', 'Attendance records', 'Termination documentation']) },
  { claim: 'insurance_denial', name: 'Insurance Bad Faith', burden: 'preponderance', elements: JSON.stringify(['Valid insurance policy', 'Covered claim submitted', 'Unreasonable denial or delay', 'No reasonable basis for denial', 'Insurer knew or recklessly disregarded lack of basis']), evidence: JSON.stringify(['Policy documents', 'Claim submission', 'Denial letter', 'Claims file', 'Expert testimony']) },
  { claim: 'environmental_justice', name: 'Environmental Justice - Title VI', burden: 'preponderance', elements: JSON.stringify(['Federal financial assistance recipient', 'Facially neutral policy', 'Disparate impact on protected group', 'Unjustified by legitimate objective']), evidence: JSON.stringify(['Environmental data', 'Demographic data', 'Health studies', 'Permit records', 'Community testimony']) },
  { claim: 'nursing_home_abuse', name: 'Nursing Home Negligence', burden: 'preponderance', elements: JSON.stringify(['Duty of care existed', 'Breach of standard of care', 'Causation', 'Damages']), evidence: JSON.stringify(['Medical records', 'Staffing records', 'Inspection reports', 'Incident reports', 'Expert testimony']) },
  { claim: 'foreclosure_defense', name: 'Wrongful Foreclosure Defense', burden: 'preponderance', elements: JSON.stringify(['Mortgage exists', 'Foreclosure initiated', 'Procedural or substantive defect', 'Harm to borrower']), evidence: JSON.stringify(['Mortgage documents', 'Notice of default', 'Payment records', 'RESPA correspondence', 'Chain of title']) },
  { claim: 'privacy', name: 'Privacy Violation - State Law', burden: 'preponderance', elements: JSON.stringify(['Reasonable expectation of privacy', 'Intrusion or disclosure', 'Highly offensive to reasonable person', 'Damages']), evidence: JSON.stringify(['Privacy policy', 'Data breach records', 'Communication records', 'Expert testimony', 'Damage documentation']) },
  { claim: 'title_ix', name: 'Title IX Education Discrimination', burden: 'preponderance', elements: JSON.stringify(['Educational institution receives federal funds', 'Discrimination based on sex', 'Deliberate indifference by institution', 'Harm to student']), evidence: JSON.stringify(['School records', 'Complaint documentation', 'Investigation records', 'Witness statements', 'Policy documents']) },
  { claim: 'domestic_violence', name: 'Domestic Violence Protection Order', burden: 'preponderance', elements: JSON.stringify(['Domestic relationship exists', 'Acts of domestic violence occurred', 'Threat of future violence', 'Need for protection']), evidence: JSON.stringify(['Incident documentation', 'Police reports', 'Medical records', 'Photos', 'Witness statements']) },
  { claim: 'asylum', name: 'Asylum - Well-Founded Fear', burden: 'clear_probability', elements: JSON.stringify(['Persecution occurred or feared', 'Based on protected ground', 'Government unable or unwilling to protect', 'No firm resettlement', 'Filed within one year']), evidence: JSON.stringify(['Country conditions reports', 'Personal declaration', 'Corroborating documents', 'Expert testimony', 'Medical/psychological evaluation']) },
  { claim: 'veterans_benefits', name: 'VA Disability Compensation', burden: 'benefit_of_doubt', elements: JSON.stringify(['Current disability exists', 'In-service event or injury', 'Nexus between service and disability']), evidence: JSON.stringify(['Service records', 'Medical records', 'C&P exam', 'Buddy statements', 'Medical nexus opinion']) },
  { claim: 'unemployment', name: 'Unemployment Benefits Eligibility', burden: 'preponderance', elements: JSON.stringify(['Was employed', 'Separated from employment', 'Separation was not for misconduct', 'Able and available for work', 'Actively seeking work']), evidence: JSON.stringify(['Employment records', 'Separation documentation', 'Job search records', 'Employer statements', 'Attendance records']) },
];

for (const p of proofData) {
  pid2++;
  proofs.push([pid2, p.claim, p.name, p.burden, p.elements, p.evidence, 'active', now, now]);
}

await safeInsert('proof_frameworks',
  ['id', 'claim_type', 'name', 'burden_of_proof', 'elements', 'evidence_types', 'status', 'created_at', 'updated_at'],
  proofs, 'Proof Frameworks');

// ============================================================
// 14. WEAK JOINT REGISTRY — Need ~25 more to hit target of 50
// ============================================================
console.log('\n14. Seeding Weak Joint Registry...');

const weakJoints = [];
let wjid2 = 100;

const wjData = [
  { name: 'EEOC Filing Deadline', type: 'procedural', domain: 'employment', desc: 'Failure to file EEOC charge within 180/300 days', risk: 90, mitigation: 'Calendar all deadlines immediately upon intake' },
  { name: 'Statute of Limitations Expiry', type: 'procedural', domain: 'general', desc: 'Missing statute of limitations for civil claims', risk: 95, mitigation: 'Calculate and calendar all SOL dates at case opening' },
  { name: 'Exhaustion Requirement', type: 'procedural', domain: 'employment', desc: 'Failure to exhaust administrative remedies before filing suit', risk: 85, mitigation: 'Map all required administrative steps before litigation' },
  { name: 'Notice Requirement', type: 'procedural', domain: 'housing', desc: 'Failure to provide required notice to landlord before action', risk: 80, mitigation: 'Send certified mail notice with return receipt' },
  { name: 'Evidence Preservation', type: 'evidentiary', domain: 'general', desc: 'Failure to preserve critical evidence before spoliation', risk: 85, mitigation: 'Send litigation hold letters immediately' },
  { name: 'Witness Availability', type: 'evidentiary', domain: 'general', desc: 'Key witnesses become unavailable or uncooperative', risk: 75, mitigation: 'Obtain declarations early and preserve testimony' },
  { name: 'Documentation Gap', type: 'evidentiary', domain: 'employment', desc: 'Lack of contemporaneous documentation of discriminatory acts', risk: 80, mitigation: 'Create detailed timeline from memory and available records' },
  { name: 'Medical Record Gap', type: 'evidentiary', domain: 'benefits', desc: 'Insufficient medical documentation for disability claims', risk: 85, mitigation: 'Obtain all treating physician records and request detailed opinions' },
  { name: 'Credibility Challenge', type: 'evidentiary', domain: 'general', desc: 'Opposing party challenges claimant credibility', risk: 70, mitigation: 'Corroborate testimony with documentary evidence' },
  { name: 'Employer Retaliation', type: 'strategic', domain: 'employment', desc: 'Employer retaliates during pending claim', risk: 75, mitigation: 'Document all interactions and file retaliation charge if needed' },
  { name: 'Financial Pressure', type: 'strategic', domain: 'general', desc: 'Claimant faces financial pressure to accept low settlement', risk: 80, mitigation: 'Connect with emergency assistance and legal aid resources' },
  { name: 'Jurisdictional Challenge', type: 'procedural', domain: 'general', desc: 'Opposing party challenges jurisdiction or venue', risk: 65, mitigation: 'Research jurisdiction thoroughly before filing' },
  { name: 'Standing Challenge', type: 'procedural', domain: 'civil_rights', desc: 'Challenge to plaintiff standing in civil rights cases', risk: 70, mitigation: 'Document concrete injury and traceability' },
  { name: 'Qualified Immunity Defense', type: 'strategic', domain: 'civil_rights', desc: 'Government officials assert qualified immunity', risk: 85, mitigation: 'Research clearly established law in jurisdiction' },
  { name: 'Arbitration Clause', type: 'procedural', domain: 'consumer', desc: 'Mandatory arbitration clause blocks court access', risk: 80, mitigation: 'Research unconscionability and exemptions' },
  { name: 'At-Will Employment Defense', type: 'strategic', domain: 'employment', desc: 'Employer asserts at-will employment as defense', risk: 75, mitigation: 'Identify exceptions: discrimination, retaliation, public policy' },
  { name: 'Preemption Defense', type: 'procedural', domain: 'general', desc: 'Federal preemption of state claims', risk: 70, mitigation: 'Research preemption doctrine for specific claim type' },
  { name: 'Comparative Fault', type: 'strategic', domain: 'general', desc: 'Defendant asserts claimant comparative fault', risk: 65, mitigation: 'Minimize and contextualize any contributory conduct' },
  { name: 'Damages Proof', type: 'evidentiary', domain: 'general', desc: 'Difficulty proving specific damages amount', risk: 75, mitigation: 'Gather financial records, expert testimony, and comparable cases' },
  { name: 'Class Certification', type: 'procedural', domain: 'employment', desc: 'Failure to obtain class certification in class action', risk: 70, mitigation: 'Ensure numerosity, commonality, typicality, and adequacy' },
  { name: 'Discovery Abuse', type: 'procedural', domain: 'general', desc: 'Opposing party engages in discovery obstruction', risk: 65, mitigation: 'File motions to compel promptly' },
  { name: 'Insurance Coverage Dispute', type: 'strategic', domain: 'consumer', desc: 'Insurer disputes coverage applicability', risk: 75, mitigation: 'Review policy language carefully and obtain expert opinion' },
  { name: 'Government Immunity', type: 'procedural', domain: 'civil_rights', desc: 'Government entity asserts sovereign immunity', risk: 80, mitigation: 'Research applicable waivers and exceptions' },
  { name: 'Statute of Repose', type: 'procedural', domain: 'general', desc: 'Claim barred by statute of repose regardless of discovery', risk: 85, mitigation: 'Identify repose periods early and calendar them' },
  { name: 'Expert Witness Challenge', type: 'evidentiary', domain: 'general', desc: 'Daubert challenge to expert testimony', risk: 70, mitigation: 'Ensure expert qualifications and methodology meet standards' },
];

for (const wj of wjData) {
  wjid2++;
  weakJoints.push([wjid2, wj.name, wj.type, wj.domain, wj.desc, wj.risk, wj.mitigation, 'active', now, now]);
}

await safeInsert('weak_joint_registry',
  ['id', 'name', 'type', 'domain', 'description', 'risk_score', 'mitigation', 'status', 'created_at', 'updated_at'],
  weakJoints, 'Weak Joint Registry');

// ============================================================
// FINAL: Print summary and verify counts
// ============================================================
console.log('\n=== Verifying Final Counts ===\n');

const tables = [
  'legal_statutes', 'legal_case_law', 'agency_authority_map', 'claim_catalog',
  'lumensend_templates', 'assembly_section_library', 'legislator_contacts',
  'advocacy_organizations', 'advocacy_targets', 'doctrine_registry',
  'court_directory', 'workflows', 'evidence_profiles', 'deadline_rules',
  'escalation_routes', 'weak_joint_registry', 'proof_frameworks',
  'signal_registry', 'pattern_registry', 'settlement_formulas',
  'evidence_confidence_rules', 'claim_validation_rules',
  'remedy_feasibility_rules', 'procedural_paths',
  'coalition_legislators', 'coalition_agencies',
  'coalition_advocacy_orgs', 'coalition_media'
];

let totalRecords = 0;
for (const t of tables) {
  try {
    const [rows] = await conn.query(`SELECT COUNT(*) as cnt FROM ${t}`);
    const cnt = rows[0].cnt;
    totalRecords += cnt;
    console.log(`  ${t}: ${cnt}`);
  } catch (e) {
    console.log(`  ${t}: ERROR - ${e.message}`);
  }
}

console.log(`\n  TOTAL RECORDS: ${totalRecords}`);
console.log('\n=== Session 62 Seed Complete ===');

await conn.end();
