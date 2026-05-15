/**
 * AKB Seed Script — Oregon + California
 * Seeds 4 domains × Oregon + California with verified agency data.
 * Run: node server/seed-akb-or-ca.mjs
 * 
 * Extends the existing WA seed data (4 statutes, 10 agencies, 24 record types, 20 mappings).
 * Uses auto-increment IDs — no hardcoded offsets needed.
 */

// ─── Helper ───
function esc(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ═══════════════════════════════════════════════════════════════
// OREGON
// ═══════════════════════════════════════════════════════════════

const orStatutes = [
  {
    stateCode: "OR",
    lawName: "Oregon Public Records Law",
    statuteReference: "ORS 192.311-192.478",
    responseDeadlineDays: 15,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Public bodies must respond within 15 business days. Elected officials must respond within 7 business days. State agency denials appealable to Oregon Attorney General. Local agency denials appealable to county District Attorney. Fee waivers available for public interest requests."
  },
  {
    stateCode: "OR",
    lawName: "Oregon Indian Child Welfare Act",
    statuteReference: "ORS 419B.090 / 25 USC 1901",
    responseDeadlineDays: null,
    appealDeadlineDays: null,
    feeWaiverAvailable: false,
    expeditedProcessingAvailable: false,
    notes: "Oregon implements federal ICWA through ORS 419B. DHS child welfare records requests handled under Oregon Public Records Law. Tribal affiliation verification through Bureau of Indian Affairs or tribal enrollment offices."
  },
  {
    stateCode: "OR",
    lawName: "Oregon Insurance Code",
    statuteReference: "ORS 731-752",
    responseDeadlineDays: 15,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Oregon Division of Financial Regulation (DFR) records subject to Oregon Public Records Law. Insurance company internal records are NOT public records — must be obtained through discovery or direct request to insurer. DFR complaint files and regulatory actions are public."
  },
  {
    stateCode: "OR",
    lawName: "Oregon Long-Term Care Regulation",
    statuteReference: "ORS 441 / ORS 443",
    responseDeadlineDays: 15,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Nursing facilities under ORS 441, residential care/assisted living under ORS 443. Oregon DHS Aging and People with Disabilities division handles licensing and inspections. Inspection reports available through DHS."
  }
];

const orAgencies = [
  // Police Misconduct — OR
  {
    stateCode: "OR",
    jurisdictionLevel: "municipal",
    agencyName: "Portland Police Bureau",
    agencyComponent: "Records Division",
    portalUrl: "https://www.portland.gov/police/records",
    email: "ppbrecords@portlandoregon.gov",
    mailingAddress: "Portland Police Bureau, Records Division, 1111 SW 2nd Ave, Portland, OR 97204",
    submissionMethods: "mixed",
    notes: "Submit records requests through City of Portland online portal or by email. Initial police reports available at Records Division. Body camera footage requests may take additional time."
  },
  {
    stateCode: "OR",
    jurisdictionLevel: "municipal",
    agencyName: "Portland Independent Police Review",
    agencyComponent: null,
    portalUrl: "https://www.portland.gov/ipr",
    email: "ipr@portlandoregon.gov",
    mailingAddress: "Independent Police Review, 1221 SW 4th Ave, Room 140, Portland, OR 97204",
    submissionMethods: "email",
    notes: "IPR handles civilian complaints against Portland Police Bureau officers. Closed case summaries available. Full investigation files via public records request."
  },
  {
    stateCode: "OR",
    jurisdictionLevel: "state",
    agencyName: "Oregon State Police",
    agencyComponent: "Public Records Unit",
    portalUrl: "https://www.oregon.gov/osp/pages/records.aspx",
    email: null,
    mailingAddress: "Oregon State Police, Public Records Unit, 3565 Trelstad Ave SE, Salem, OR 97317",
    submissionMethods: "mixed",
    notes: "OSP handles statewide law enforcement records. Criminal background checks through separate process. Incident reports and investigation files via public records request."
  },
  {
    stateCode: "OR",
    jurisdictionLevel: "county",
    agencyName: "Multnomah County District Attorney",
    agencyComponent: "Public Records",
    portalUrl: "https://www.mcda.us/",
    email: null,
    mailingAddress: "Multnomah County DA, 1021 SW 4th Ave, Suite 600, Portland, OR 97204",
    submissionMethods: "mixed",
    notes: "Also serves as the appeal body for local agency public records denials in Multnomah County."
  },
  // ICWA — OR
  {
    stateCode: "OR",
    jurisdictionLevel: "state",
    agencyName: "Oregon Department of Human Services",
    agencyComponent: "Child Welfare Division",
    portalUrl: "https://www.oregon.gov/odhs/pages/public-records.aspx",
    email: null,
    mailingAddress: "DHS Public Records, 500 Summer St NE E15, Salem, OR 97301",
    submissionMethods: "mixed",
    notes: "Child welfare records including dependency case files, ICWA compliance documentation. Some records exempt under ORS 419A.255 (juvenile records). Submit through DHS public records portal."
  },
  {
    stateCode: "OR",
    jurisdictionLevel: "court",
    agencyName: "Oregon Circuit Court Clerk",
    agencyComponent: "Records Division",
    portalUrl: "https://www.courts.oregon.gov/services/online/Pages/ojcin.aspx",
    email: null,
    mailingAddress: null,
    submissionMethods: "mixed",
    notes: "Court records for dependency proceedings. Contact the specific county Circuit Court clerk. Oregon eCourt Case Information (OECI) available online for some records."
  },
  // Insurance — OR
  {
    stateCode: "OR",
    jurisdictionLevel: "state",
    agencyName: "Oregon Division of Financial Regulation",
    agencyComponent: "Consumer Advocacy",
    portalUrl: "https://dfr.oregon.gov/consumers/file-complaint",
    email: "dfr.insurancehelp@dcbs.oregon.gov",
    mailingAddress: "Division of Financial Regulation, PO Box 14480, Salem, OR 97309-0405",
    submissionMethods: "mixed",
    notes: "Handles insurance complaints and regulatory actions. Complaint files are public records. Consumer advocacy team assists with claim disputes."
  },
  // Elder Abuse — OR
  {
    stateCode: "OR",
    jurisdictionLevel: "state",
    agencyName: "Oregon DHS Aging and People with Disabilities",
    agencyComponent: "Licensing and Regulatory Oversight",
    portalUrl: "https://www.oregon.gov/odhs/providers-partners/Pages/ltc-licensing.aspx",
    email: null,
    mailingAddress: "DHS APD, 500 Summer St NE E10, Salem, OR 97301",
    submissionMethods: "mixed",
    notes: "Handles licensing, inspections, and complaint investigations for nursing facilities, residential care, and assisted living. Inspection reports available through DHS."
  },
  {
    stateCode: "OR",
    jurisdictionLevel: "state",
    agencyName: "Oregon Long-Term Care Ombudsman",
    agencyComponent: null,
    portalUrl: "https://www.oregon.gov/ltco/pages/default.aspx",
    email: null,
    mailingAddress: "Office of the Long-Term Care Ombudsman, 3855 Wolverine NE Suite 6, Salem, OR 97305",
    submissionMethods: "mixed",
    notes: "Advocates for residents of long-term care facilities. Complaint records may be confidential under federal Older Americans Act. Contact: 1-800-522-2602."
  }
];

// ═══════════════════════════════════════════════════════════════
// CALIFORNIA
// ═══════════════════════════════════════════════════════════════

const caStatutes = [
  {
    stateCode: "CA",
    lawName: "California Public Records Act",
    statuteReference: "Gov Code 7920-7931",
    responseDeadlineDays: 10,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Agencies must determine within 10 calendar days whether records will be disclosed. Extension of up to 14 additional days for unusual circumstances. NO formal administrative appeal — must file lawsuit in court. Fees limited to direct costs of duplication. Recodified from Gov Code 6250-6270.5 effective Jan 1, 2023."
  },
  {
    stateCode: "CA",
    lawName: "California Indian Child Welfare Act",
    statuteReference: "Welf & Inst Code 224-224.6 / 25 USC 1901",
    responseDeadlineDays: null,
    appealDeadlineDays: null,
    feeWaiverAvailable: false,
    expeditedProcessingAvailable: false,
    notes: "California implements federal ICWA through Welfare and Institutions Code. AB 3176 (2006) strengthened CA ICWA protections. Child welfare records requests through county social services or CDSS. Tribal affiliation verification through BIA or tribal enrollment."
  },
  {
    stateCode: "CA",
    lawName: "California Insurance Code",
    statuteReference: "Cal Ins Code 790-790.10",
    responseDeadlineDays: 10,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "California Department of Insurance (CDI) records subject to CPRA. Insurance company internal records NOT public — obtain through discovery. CDI complaint files and market conduct exam reports are public. Cal Ins Code 790.03 defines unfair practices."
  },
  {
    stateCode: "CA",
    lawName: "California Long-Term Care Regulation",
    statuteReference: "Health & Safety Code 1250-1339.59",
    responseDeadlineDays: 10,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "California Department of Public Health (CDPH) Licensing and Certification Division handles facility inspections. Inspection reports available through CDPH. Health & Safety Code 1280-1280.4 covers inspections and enforcement."
  },
  {
    stateCode: "CA",
    lawName: "California Police Transparency Laws",
    statuteReference: "Penal Code 832.7 / SB 1421 / SB 16",
    responseDeadlineDays: 10,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "SB 1421 (2019) requires disclosure of officer records related to: discharge of firearm, use of force causing death/great bodily injury, sexual assault, dishonesty. SB 16 (2022) expanded to: sustained findings of unreasonable force, discriminatory conduct, unlawful searches/arrests. Records available through CPRA request to employing agency."
  }
];

const caAgencies = [
  // Police Misconduct — CA
  {
    stateCode: "CA",
    jurisdictionLevel: "municipal",
    agencyName: "Los Angeles Police Department",
    agencyComponent: "Discovery Section",
    portalUrl: "https://www.lapdonline.org/public-records-requests/",
    email: null,
    mailingAddress: "LAPD Discovery Section, 100 W 1st St, Suite 842, Los Angeles, CA 90012",
    submissionMethods: "portal",
    notes: "Submit CPRA requests through LAPD online portal. SB 1421/SB 16 records requests may require specific reference to the statute. Body camera footage requests processed separately."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "municipal",
    agencyName: "Los Angeles Board of Police Commissioners",
    agencyComponent: "Inspector General",
    portalUrl: "https://www.oig.lacity.org/",
    email: null,
    mailingAddress: "Office of the Inspector General, 100 W 1st St, Suite 725, Los Angeles, CA 90012",
    submissionMethods: "mixed",
    notes: "OIG provides civilian oversight of LAPD. Published reports available on website. Investigation files via CPRA request."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "municipal",
    agencyName: "San Francisco Police Department",
    agencyComponent: "Records Unit",
    portalUrl: "https://www.sanfranciscopolice.org/your-sfpd/published-information/public-records-requests",
    email: "sfpdpublicrecords@sfgov.org",
    mailingAddress: "SFPD Records Unit, 1245 3rd St, 5th Floor, San Francisco, CA 94158",
    submissionMethods: "mixed",
    notes: "Submit CPRA requests by email or through SF City portal. DGO 10.11 governs release of police records."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "municipal",
    agencyName: "San Francisco Department of Police Accountability",
    agencyComponent: null,
    portalUrl: "https://sfgov.org/dpa/",
    email: "dpa@sfgov.org",
    mailingAddress: "DPA, 1 Dr. Carlton B. Goodlett Place, Room 425, San Francisco, CA 94102",
    submissionMethods: "email",
    notes: "DPA handles civilian complaints against SFPD officers. Closed case summaries available. Full investigation files via CPRA request."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Department of Justice",
    agencyComponent: "Public Records Unit",
    portalUrl: "https://oag.ca.gov/open-government",
    email: null,
    mailingAddress: "CA DOJ Public Records Unit, PO Box 944255, Sacramento, CA 94244-2550",
    submissionMethods: "mixed",
    notes: "CA DOJ maintains URSUS (Use of Force) database and OpenJustice data portal. Criminal justice statistics and officer certification records. CPRA requests through AG website."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Commission on Peace Officer Standards and Training",
    agencyComponent: null,
    portalUrl: "https://post.ca.gov/Public-Records-Requests",
    email: null,
    mailingAddress: "POST, 860 Stillwater Rd, Suite 100, West Sacramento, CA 95605",
    submissionMethods: "portal",
    notes: "POST maintains officer certification records, training records, and decertification actions. AB 846 (2020) established decertification process. Records available via CPRA."
  },
  // ICWA — CA
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Department of Social Services",
    agencyComponent: "Children and Family Services Division",
    portalUrl: "https://www.cdss.ca.gov/public-records-requests",
    email: null,
    mailingAddress: "CDSS Public Records Coordinator, 744 P St, Sacramento, CA 95814",
    submissionMethods: "mixed",
    notes: "State-level child welfare policy and data. Individual case records held by county social services agencies. CDSS maintains statewide data through CWS/CMS system."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "county",
    agencyName: "Los Angeles County Department of Children and Family Services",
    agencyComponent: "Records Management",
    portalUrl: "https://dcfs.lacounty.gov/",
    email: null,
    mailingAddress: "DCFS Records Management, 425 Shatto Place, Los Angeles, CA 90020",
    submissionMethods: "mixed",
    notes: "LA County DCFS handles child welfare cases including ICWA compliance. Records requests through county CPRA process. Some records exempt under Welf & Inst Code 827."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "court",
    agencyName: "California Superior Court Clerk",
    agencyComponent: "Records Division",
    portalUrl: null,
    email: null,
    mailingAddress: null,
    submissionMethods: "mixed",
    notes: "Court records for dependency proceedings. Contact the specific county Superior Court clerk. LA County uses the court website for case access. Juvenile records restricted under Welf & Inst Code 827."
  },
  // Insurance — CA
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Department of Insurance",
    agencyComponent: "Consumer Services Division",
    portalUrl: "https://www.insurance.ca.gov/01-consumers/101-help/",
    email: null,
    mailingAddress: "CDI Consumer Services, 300 Capitol Mall, Suite 1700, Sacramento, CA 95814",
    submissionMethods: "mixed",
    notes: "Handles insurance complaints and regulatory actions. Complaint files are public records under CPRA. Market conduct examination reports available. Consumer hotline: 1-800-927-4357."
  },
  // Elder Abuse — CA
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Department of Public Health",
    agencyComponent: "Licensing and Certification Division",
    portalUrl: "https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/Program-Landing.aspx",
    email: null,
    mailingAddress: "CDPH L&C, PO Box 997377, MS 3000, Sacramento, CA 95899-7377",
    submissionMethods: "mixed",
    notes: "Handles nursing home inspections and enforcement. Inspection reports available through Health Facility Consumer Information System (HFCIS). Complaint investigations via CPRA."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Department of Social Services Community Care Licensing",
    agencyComponent: "Residential Care for the Elderly",
    portalUrl: "https://www.cdss.ca.gov/inforesources/community-care-licensing",
    email: null,
    mailingAddress: "CDSS CCL, 744 P St, MS 3-31, Sacramento, CA 95814",
    submissionMethods: "mixed",
    notes: "Licenses and inspects residential care facilities for the elderly (RCFE). Facility reports searchable online through Community Care Licensing Division website."
  },
  {
    stateCode: "CA",
    jurisdictionLevel: "state",
    agencyName: "California Long-Term Care Ombudsman",
    agencyComponent: null,
    portalUrl: "https://www.aging.ca.gov/Programs_and_Services/Long-Term_Care_Ombudsman/",
    email: null,
    mailingAddress: "CA Dept of Aging, 2880 Gateway Oaks Dr, Suite 200, Sacramento, CA 95833",
    submissionMethods: "mixed",
    notes: "Advocates for residents of nursing homes, residential care facilities, and assisted living. Complaint records may be confidential under federal Older Americans Act. CRISISline: 1-800-231-4024."
  }
];

// ═══════════════════════════════════════════════════════════════
// GENERATE SQL
// ═══════════════════════════════════════════════════════════════

let sql = "-- AKB Seed Data: Oregon + California (4 domains each)\n";
sql += "-- Run after WA seed data is already in place\n\n";

// Oregon Statutes
sql += "-- ═══ OREGON STATUTES ═══\n";
for (const s of orStatutes) {
  sql += `INSERT INTO foia_statutes (stateCode, lawName, statuteReference, responseDeadlineDays, appealDeadlineDays, feeWaiverAvailable, expeditedProcessingAvailable, notes) VALUES (${esc(s.stateCode)}, ${esc(s.lawName)}, ${esc(s.statuteReference)}, ${esc(s.responseDeadlineDays)}, ${esc(s.appealDeadlineDays)}, ${esc(s.feeWaiverAvailable)}, ${esc(s.expeditedProcessingAvailable)}, ${esc(s.notes)});\n`;
}

// California Statutes
sql += "\n-- ═══ CALIFORNIA STATUTES ═══\n";
for (const s of caStatutes) {
  sql += `INSERT INTO foia_statutes (stateCode, lawName, statuteReference, responseDeadlineDays, appealDeadlineDays, feeWaiverAvailable, expeditedProcessingAvailable, notes) VALUES (${esc(s.stateCode)}, ${esc(s.lawName)}, ${esc(s.statuteReference)}, ${esc(s.responseDeadlineDays)}, ${esc(s.appealDeadlineDays)}, ${esc(s.feeWaiverAvailable)}, ${esc(s.expeditedProcessingAvailable)}, ${esc(s.notes)});\n`;
}

// Oregon Agencies
sql += "\n-- ═══ OREGON AGENCIES ═══\n";
for (const a of orAgencies) {
  sql += `INSERT INTO foia_agencies (stateCode, jurisdictionLevel, agencyName, agencyComponent, portalUrl, email, mailingAddress, submissionMethods, notes) VALUES (${esc(a.stateCode)}, ${esc(a.jurisdictionLevel)}, ${esc(a.agencyName)}, ${esc(a.agencyComponent)}, ${esc(a.portalUrl)}, ${esc(a.email)}, ${esc(a.mailingAddress)}, ${esc(a.submissionMethods)}, ${esc(a.notes)});\n`;
}

// California Agencies
sql += "\n-- ═══ CALIFORNIA AGENCIES ═══\n";
for (const a of caAgencies) {
  sql += `INSERT INTO foia_agencies (stateCode, jurisdictionLevel, agencyName, agencyComponent, portalUrl, email, mailingAddress, submissionMethods, notes) VALUES (${esc(a.stateCode)}, ${esc(a.jurisdictionLevel)}, ${esc(a.agencyName)}, ${esc(a.agencyComponent)}, ${esc(a.portalUrl)}, ${esc(a.email)}, ${esc(a.mailingAddress)}, ${esc(a.submissionMethods)}, ${esc(a.notes)});\n`;
}

// Record types are domain-level (not state-specific) — already seeded by WA.
// The same record types (incident_report, internal_affairs_file, etc.) apply across states.
// We only need to add agency-record mappings for the new OR/CA agencies.

sql += "\n-- ═══ NOTE: Record types are domain-level and already seeded ═══\n";
sql += "-- We reuse the same record type IDs for OR/CA agency mappings.\n";
sql += "-- Record type IDs: 1=incident_report, 2=internal_affairs_file, 3=body_camera_footage,\n";
sql += "-- 4=dispatch_logs, 5=use_of_force_report, 6=complaint_history,\n";
sql += "-- 7=tribal_notice, 8=active_efforts_documentation, 9=placement_preference_documentation,\n";
sql += "-- 10=dependency_petition, 11=qualified_expert_witness_testimony, 12=court_orders,\n";
sql += "-- 13=claim_file, 14=adjuster_notes, 15=coverage_determination_letter,\n";
sql += "-- 16=communications_log, 17=inspection_report, 18=oic_complaint_file,\n";
sql += "-- 19=facility_inspection_report, 20=complaint_investigation, 21=care_plan,\n";
sql += "-- 22=incident_report(elder), 23=staffing_logs, 24=licensing_records\n\n";

// Agency-Record Mappings use @variables to reference auto-increment IDs
// We'll use a different approach: query the IDs by name

sql += "-- ═══ AGENCY-RECORD MAPPINGS (Oregon) ═══\n";
sql += "-- We use subqueries to resolve agency IDs by name for safety\n\n";

// Oregon mappings
const orMappings = [
  // Portland Police Bureau → police records
  { agency: "Portland Police Bureau", recordType: "incident_report", statute: "Oregon Public Records Law", confidence: "high" },
  { agency: "Portland Police Bureau", recordType: "body_camera_footage", statute: "Oregon Public Records Law", confidence: "high" },
  { agency: "Portland Police Bureau", recordType: "dispatch_logs", statute: "Oregon Public Records Law", confidence: "high" },
  { agency: "Portland Police Bureau", recordType: "use_of_force_report", statute: "Oregon Public Records Law", confidence: "high" },
  // Portland IPR → oversight records
  { agency: "Portland Independent Police Review", recordType: "internal_affairs_file", statute: "Oregon Public Records Law", confidence: "high" },
  { agency: "Portland Independent Police Review", recordType: "complaint_history", statute: "Oregon Public Records Law", confidence: "high" },
  // Oregon State Police → statewide records
  { agency: "Oregon State Police", recordType: "incident_report", statute: "Oregon Public Records Law", confidence: "high" },
  { agency: "Oregon State Police", recordType: "use_of_force_report", statute: "Oregon Public Records Law", confidence: "high" },
  // Multnomah County DA → prosecution records
  { agency: "Multnomah County District Attorney", recordType: "incident_report", statute: "Oregon Public Records Law", confidence: "medium" },
  // Oregon DHS → ICWA records
  { agency: "Oregon Department of Human Services", recordType: "tribal_notice", statute: "Oregon Indian Child Welfare Act", confidence: "high" },
  { agency: "Oregon Department of Human Services", recordType: "active_efforts_documentation", statute: "Oregon Indian Child Welfare Act", confidence: "high" },
  { agency: "Oregon Department of Human Services", recordType: "placement_preference_documentation", statute: "Oregon Indian Child Welfare Act", confidence: "high" },
  { agency: "Oregon Department of Human Services", recordType: "dependency_petition", statute: "Oregon Indian Child Welfare Act", confidence: "medium" },
  // Oregon Circuit Court → court records
  { agency: "Oregon Circuit Court Clerk", recordType: "dependency_petition", statute: "Oregon Indian Child Welfare Act", confidence: "high" },
  { agency: "Oregon Circuit Court Clerk", recordType: "qualified_expert_witness_testimony", statute: "Oregon Indian Child Welfare Act", confidence: "high" },
  { agency: "Oregon Circuit Court Clerk", recordType: "court_orders", statute: "Oregon Indian Child Welfare Act", confidence: "high" },
  // Oregon DFR → insurance records
  { agency: "Oregon Division of Financial Regulation", recordType: "oic_complaint_file", statute: "Oregon Insurance Code", confidence: "high" },
  // Oregon DHS APD → elder abuse records
  { agency: "Oregon DHS Aging and People with Disabilities", recordType: "facility_inspection_report", statute: "Oregon Long-Term Care Regulation", confidence: "high" },
  { agency: "Oregon DHS Aging and People with Disabilities", recordType: "complaint_investigation", statute: "Oregon Long-Term Care Regulation", confidence: "high" },
  { agency: "Oregon DHS Aging and People with Disabilities", recordType: "licensing_records", statute: "Oregon Long-Term Care Regulation", confidence: "high" },
  // Oregon LTC Ombudsman
  { agency: "Oregon Long-Term Care Ombudsman", recordType: "complaint_investigation", statute: "Oregon Long-Term Care Regulation", confidence: "medium" },
];

// California mappings
const caMappings = [
  // LAPD → police records
  { agency: "Los Angeles Police Department", recordType: "incident_report", statute: "California Public Records Act", confidence: "high" },
  { agency: "Los Angeles Police Department", recordType: "body_camera_footage", statute: "California Public Records Act", confidence: "high" },
  { agency: "Los Angeles Police Department", recordType: "dispatch_logs", statute: "California Public Records Act", confidence: "high" },
  { agency: "Los Angeles Police Department", recordType: "use_of_force_report", statute: "California Public Records Act", confidence: "high" },
  { agency: "Los Angeles Police Department", recordType: "internal_affairs_file", statute: "California Police Transparency Laws", confidence: "high" },
  { agency: "Los Angeles Police Department", recordType: "complaint_history", statute: "California Police Transparency Laws", confidence: "high" },
  // LA OIG
  { agency: "Los Angeles Board of Police Commissioners", recordType: "internal_affairs_file", statute: "California Public Records Act", confidence: "medium" },
  // SFPD → police records
  { agency: "San Francisco Police Department", recordType: "incident_report", statute: "California Public Records Act", confidence: "high" },
  { agency: "San Francisco Police Department", recordType: "body_camera_footage", statute: "California Public Records Act", confidence: "high" },
  { agency: "San Francisco Police Department", recordType: "use_of_force_report", statute: "California Public Records Act", confidence: "high" },
  { agency: "San Francisco Police Department", recordType: "internal_affairs_file", statute: "California Police Transparency Laws", confidence: "high" },
  // SF DPA
  { agency: "San Francisco Department of Police Accountability", recordType: "internal_affairs_file", statute: "California Public Records Act", confidence: "high" },
  { agency: "San Francisco Department of Police Accountability", recordType: "complaint_history", statute: "California Public Records Act", confidence: "high" },
  // CA DOJ
  { agency: "California Department of Justice", recordType: "use_of_force_report", statute: "California Public Records Act", confidence: "high" },
  { agency: "California Department of Justice", recordType: "complaint_history", statute: "California Public Records Act", confidence: "medium" },
  // POST
  { agency: "California Commission on Peace Officer Standards and Training", recordType: "complaint_history", statute: "California Police Transparency Laws", confidence: "high" },
  // CDSS → ICWA records
  { agency: "California Department of Social Services", recordType: "tribal_notice", statute: "California Indian Child Welfare Act", confidence: "high" },
  { agency: "California Department of Social Services", recordType: "active_efforts_documentation", statute: "California Indian Child Welfare Act", confidence: "high" },
  { agency: "California Department of Social Services", recordType: "placement_preference_documentation", statute: "California Indian Child Welfare Act", confidence: "high" },
  // LA County DCFS → ICWA records
  { agency: "Los Angeles County Department of Children and Family Services", recordType: "tribal_notice", statute: "California Indian Child Welfare Act", confidence: "high" },
  { agency: "Los Angeles County Department of Children and Family Services", recordType: "active_efforts_documentation", statute: "California Indian Child Welfare Act", confidence: "high" },
  { agency: "Los Angeles County Department of Children and Family Services", recordType: "dependency_petition", statute: "California Indian Child Welfare Act", confidence: "medium" },
  // CA Superior Court → court records
  { agency: "California Superior Court Clerk", recordType: "dependency_petition", statute: "California Indian Child Welfare Act", confidence: "high" },
  { agency: "California Superior Court Clerk", recordType: "qualified_expert_witness_testimony", statute: "California Indian Child Welfare Act", confidence: "high" },
  { agency: "California Superior Court Clerk", recordType: "court_orders", statute: "California Indian Child Welfare Act", confidence: "high" },
  // CDI → insurance records
  { agency: "California Department of Insurance", recordType: "oic_complaint_file", statute: "California Insurance Code", confidence: "high" },
  // CDPH → elder abuse records
  { agency: "California Department of Public Health", recordType: "facility_inspection_report", statute: "California Long-Term Care Regulation", confidence: "high" },
  { agency: "California Department of Public Health", recordType: "complaint_investigation", statute: "California Long-Term Care Regulation", confidence: "high" },
  { agency: "California Department of Public Health", recordType: "licensing_records", statute: "California Long-Term Care Regulation", confidence: "high" },
  // CDSS CCL → elder abuse records
  { agency: "California Department of Social Services Community Care Licensing", recordType: "facility_inspection_report", statute: "California Long-Term Care Regulation", confidence: "high" },
  { agency: "California Department of Social Services Community Care Licensing", recordType: "complaint_investigation", statute: "California Long-Term Care Regulation", confidence: "medium" },
  // CA LTC Ombudsman
  { agency: "California Long-Term Care Ombudsman", recordType: "complaint_investigation", statute: "California Long-Term Care Regulation", confidence: "medium" },
];

// Generate mapping SQL using subqueries for safety
for (const m of [...orMappings, ...caMappings]) {
  const agencyEsc = esc(m.agency);
  const recordEsc = esc(m.recordType);
  const statuteEsc = esc(m.statute);
  sql += `INSERT INTO foia_agency_records (agencyId, recordTypeId, statuteId, confidence) VALUES ((SELECT id FROM foia_agencies WHERE agencyName = ${agencyEsc} LIMIT 1), (SELECT id FROM foia_record_types WHERE recordType = ${recordEsc} LIMIT 1), (SELECT id FROM foia_statutes WHERE lawName = ${statuteEsc} LIMIT 1), ${esc(m.confidence)});\n`;
}

console.log(sql);
