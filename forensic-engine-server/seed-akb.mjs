/**
 * AKB Seed Script — Agency Knowledge Base
 * Seeds 4 domains × Washington State with verified agency data.
 * Run: node server/seed-akb.mjs
 */

// This script outputs SQL INSERT statements that can be run via webdev_execute_sql.
// We generate the SQL deterministically — no runtime DB connection needed.

// ─── 1. FOIA Statutes ───
const statutes = [
  {
    stateCode: "WA",
    lawName: "Washington Public Records Act",
    statuteReference: "RCW 42.56",
    responseDeadlineDays: 5,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Agencies must respond within 5 business days of receiving a request. No formal appeal process — requesters must file a lawsuit or complaint with the AG. Fee waivers available at agency discretion. Covers all state and local government agencies."
  },
  {
    stateCode: "WA",
    lawName: "Washington Indian Child Welfare Act",
    statuteReference: "RCW 13.38",
    responseDeadlineDays: null,
    appealDeadlineDays: null,
    feeWaiverAvailable: false,
    expeditedProcessingAvailable: false,
    notes: "WA state implementation of federal ICWA (25 USC 1901). Records related to Indian child custody proceedings are subject to both ICWA and WA Public Records Act. DCYF records requests handled under RCW 42.56."
  },
  {
    stateCode: "WA",
    lawName: "Washington Insurance Code",
    statuteReference: "RCW 48",
    responseDeadlineDays: 5,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Office of the Insurance Commissioner records subject to WA Public Records Act. Insurance company internal records (claim files, adjuster notes) are NOT public records — must be obtained through discovery, subpoena, or direct request to insurer. OIC complaint files and regulatory actions are public."
  },
  {
    stateCode: "WA",
    lawName: "Washington Long-Term Care Act",
    statuteReference: "RCW 18.51 / RCW 70.128",
    responseDeadlineDays: 5,
    appealDeadlineDays: null,
    feeWaiverAvailable: true,
    expeditedProcessingAvailable: false,
    notes: "Nursing home licensing under RCW 18.51, adult family homes under RCW 70.128. Inspection reports and complaint investigations available through DOH and DSHS. Facility-specific records may require direct request to the facility."
  }
];

// ─── 2. FOIA Agencies ───
const agencies = [
  // Police Misconduct — WA
  {
    stateCode: "WA",
    jurisdictionLevel: "municipal",
    agencyName: "Seattle Police Department",
    agencyComponent: "Public Disclosure Unit",
    portalUrl: "https://www.seattle.gov/police/information-and-data/public-disclosure-requests/records-request-center",
    email: null,
    mailingAddress: "PO Box 34986, Seattle, WA 98124-4986",
    submissionMethods: "portal",
    notes: "Use the SPD Records Request Center portal. Initial police reports available through Front Counter Services."
  },
  {
    stateCode: "WA",
    jurisdictionLevel: "municipal",
    agencyName: "Seattle Office of Police Accountability",
    agencyComponent: null,
    portalUrl: "https://www.seattle.gov/opa",
    email: "opa@seattle.gov",
    mailingAddress: "PO Box 34986, Seattle, WA 98124-4986",
    submissionMethods: "email",
    notes: "OPA handles complaints against SPD officers. Closed case summaries available online. Full investigation files via public records request."
  },
  {
    stateCode: "WA",
    jurisdictionLevel: "municipal",
    agencyName: "Seattle Office of Inspector General for Public Safety",
    agencyComponent: null,
    portalUrl: "https://www.seattle.gov/oig",
    email: null,
    mailingAddress: null,
    submissionMethods: "portal",
    notes: "OIG provides independent oversight of SPD and OPA. Reports available on website. Records requests through Seattle public records portal."
  },
  {
    stateCode: "WA",
    jurisdictionLevel: "county",
    agencyName: "King County Prosecuting Attorney",
    agencyComponent: "Public Records Program",
    portalUrl: "https://kingcountyexec.govqa.us/WEBAPP/_rs/",
    email: null,
    mailingAddress: "King County Courthouse, 516 Third Avenue, Room W400, Seattle, WA 98104",
    submissionMethods: "portal",
    notes: "Use the King County GovQA portal for records requests. Select 'Executive Branch' then 'Prosecuting Attorney' department."
  },
  // ICWA — WA
  {
    stateCode: "WA",
    jurisdictionLevel: "state",
    agencyName: "Washington Department of Children, Youth & Families",
    agencyComponent: "Public Records Officer",
    portalUrl: "https://dcyf.wa.gov/public-records",
    email: null,
    mailingAddress: "DCYF Public Records Officer, PO Box 40975, Olympia, WA 98504-0975",
    submissionMethods: "mixed",
    notes: "Use form 17-041A for records requests. Can submit at any DCYF office or by mail. CAN history checks available through separate online portal."
  },
  {
    stateCode: "WA",
    jurisdictionLevel: "court",
    agencyName: "County Superior Court Clerk",
    agencyComponent: "Records Division",
    portalUrl: null,
    email: null,
    mailingAddress: null,
    submissionMethods: "mixed",
    notes: "Court records for dependency proceedings. Contact the specific county Superior Court clerk where the case was filed. King County uses the e-Filing and Case Access portal."
  },
  // Insurance Denial — WA
  {
    stateCode: "WA",
    jurisdictionLevel: "state",
    agencyName: "Washington Office of the Insurance Commissioner",
    agencyComponent: "Public Records Office",
    portalUrl: "https://www.insurance.wa.gov/about-us/request-public-records/submit-public-records-request",
    email: null,
    mailingAddress: "Office of the Insurance Commissioner, PO Box 40255, Olympia, WA 98504-0255",
    submissionMethods: "portal",
    notes: "Responds within 5 business days. Complaint files and regulatory actions are public. Insurance company internal records are NOT available through OIC — must request directly from insurer or through legal discovery."
  },
  // Elder Abuse — WA
  {
    stateCode: "WA",
    jurisdictionLevel: "state",
    agencyName: "Washington Department of Health",
    agencyComponent: "Facilities and Services Licensing",
    portalUrl: "https://doh.wa.gov/about-us/public-records",
    email: null,
    mailingAddress: "DOH Public Records Officer, PO Box 47890, Olympia, WA 98504-7890",
    submissionMethods: "portal",
    notes: "Facility inspection reports searchable online at doh.wa.gov. Full investigation files via public records request through DOH portal."
  },
  {
    stateCode: "WA",
    jurisdictionLevel: "state",
    agencyName: "Washington Department of Social and Health Services",
    agencyComponent: "Adult Protective Services",
    portalUrl: "https://www.dshs.wa.gov/office-of-the-secretary/how-request-public-records",
    email: null,
    mailingAddress: "DSHS Public Records, PO Box 45130, Olympia, WA 98504-5130",
    submissionMethods: "mixed",
    notes: "APS investigation records. Some records may be exempt under RCW 74.34 (Abuse of Vulnerable Adults Act). Request through any DSHS office or via mail."
  },
  {
    stateCode: "WA",
    jurisdictionLevel: "state",
    agencyName: "Washington State Long-Term Care Ombudsman",
    agencyComponent: null,
    portalUrl: "https://www.waombudsman.org/",
    email: null,
    mailingAddress: null,
    submissionMethods: "mixed",
    notes: "Advocates for residents of nursing homes, adult family homes, and assisted living. Complaint records may be confidential under federal Older Americans Act. Contact: 1-800-562-6028."
  }
];

// ─── 3. FOIA Record Types ───
const recordTypes = [
  // Police Misconduct
  { domain: "policemisconduct", recordType: "incident_report", recordDescription: "Official police report documenting the incident, including officer narrative, witness statements, and disposition.", typicalKeywords: ["incident report", "police report", "case report", "offense report"], retentionNotes: "Typically retained permanently or per state retention schedule." },
  { domain: "policemisconduct", recordType: "internal_affairs_file", recordDescription: "Complete internal affairs investigation file including complaint, investigation notes, witness interviews, findings, and disciplinary recommendations.", typicalKeywords: ["internal affairs", "IA file", "investigation file", "complaint investigation", "OPA investigation"], retentionNotes: "Retention varies by agency. SPD/OPA closed case summaries available online." },
  { domain: "policemisconduct", recordType: "body_camera_footage", recordDescription: "Body-worn camera video from officers involved in the incident.", typicalKeywords: ["body camera", "BWC", "body-worn camera", "video footage", "dash cam"], retentionNotes: "WA law requires minimum 60-day retention. Flagged recordings retained longer." },
  { domain: "policemisconduct", recordType: "dispatch_logs", recordDescription: "Computer-aided dispatch (CAD) records showing call details, unit assignments, timestamps, and officer communications.", typicalKeywords: ["dispatch", "CAD", "call log", "radio log", "911 log"], retentionNotes: "Typically retained for several years per records retention schedule." },
  { domain: "policemisconduct", recordType: "use_of_force_report", recordDescription: "Mandatory report filed when officers use physical force, including type of force, justification, and subject injuries.", typicalKeywords: ["use of force", "force report", "force incident", "type I force", "type II force", "type III force"], retentionNotes: "SPD use of force data partially available through open data portal." },
  { domain: "policemisconduct", recordType: "complaint_history", recordDescription: "History of prior complaints filed against the officer(s) involved, including outcomes and any sustained findings.", typicalKeywords: ["complaint history", "prior complaints", "sustained findings", "disciplinary history", "officer history"], retentionNotes: "OPA publishes complaint data. Full histories via public records request." },
  // ICWA
  { domain: "icwa", recordType: "tribal_notice", recordDescription: "Formal notice sent to the child's tribe(s) as required by ICWA, including proof of service by registered mail.", typicalKeywords: ["tribal notice", "ICWA notice", "notice to tribe", "registered mail", "proof of service"], retentionNotes: "Must be in court file. Absence is a due process violation." },
  { domain: "icwa", recordType: "active_efforts_documentation", recordDescription: "Documentation of active efforts made to prevent the breakup of the Indian family, as required by ICWA and RCW 13.38.", typicalKeywords: ["active efforts", "reasonable efforts", "family preservation", "reunification services", "ICWA compliance"], retentionNotes: "Must be documented in case file. Court must make active efforts finding on the record." },
  { domain: "icwa", recordType: "placement_preference_documentation", recordDescription: "Documentation showing compliance with ICWA placement preferences: extended family, tribal foster home, Indian foster home, institution approved by tribe.", typicalKeywords: ["placement preference", "ICWA placement", "tribal placement", "extended family", "Indian foster home"], retentionNotes: "Court must document good cause to deviate from placement preferences." },
  { domain: "icwa", recordType: "dependency_petition", recordDescription: "The petition filed to initiate dependency proceedings, including allegations and supporting facts.", typicalKeywords: ["dependency petition", "petition", "child welfare petition", "removal petition"], retentionNotes: "Court record. Available through Superior Court clerk." },
  { domain: "icwa", recordType: "qualified_expert_witness_testimony", recordDescription: "Testimony from a qualified expert witness with knowledge of tribal customs and child-rearing practices, required before foster care placement or termination.", typicalKeywords: ["qualified expert witness", "QEW", "expert testimony", "tribal expert", "ICWA expert"], retentionNotes: "Required by 25 USC 1912(e)/(f). Must be in court record." },
  { domain: "icwa", recordType: "court_orders", recordDescription: "All court orders related to the dependency case, including temporary custody, placement, and permanency orders.", typicalKeywords: ["court order", "custody order", "placement order", "permanency order", "dependency order"], retentionNotes: "Court records. Available through Superior Court clerk." },
  // Insurance Denial
  { domain: "insurance", recordType: "claim_file", recordDescription: "Complete insurance claim file including application, claim forms, supporting documentation, and all correspondence.", typicalKeywords: ["claim file", "claim number", "claim form", "insurance claim", "loss notice"], retentionNotes: "Held by insurance company. Not a public record. Obtain through direct request to insurer or legal discovery." },
  { domain: "insurance", recordType: "adjuster_notes", recordDescription: "Internal notes from the claims adjuster documenting investigation, evaluation, and decision-making process.", typicalKeywords: ["adjuster notes", "claim notes", "investigation notes", "evaluation notes", "file notes"], retentionNotes: "Internal insurer document. Obtain through discovery or bad faith litigation." },
  { domain: "insurance", recordType: "coverage_determination_letter", recordDescription: "Formal letter from the insurer explaining the coverage determination, including specific policy provisions cited.", typicalKeywords: ["denial letter", "coverage determination", "reservation of rights", "declination", "coverage letter"], retentionNotes: "Should be in policyholder's possession. Insurer required to provide written explanation." },
  { domain: "insurance", recordType: "communications_log", recordDescription: "Log of all communications between the insurer and the policyholder, including dates, methods, and summaries.", typicalKeywords: ["communications log", "contact log", "correspondence", "phone log", "email log"], retentionNotes: "Internal insurer document. Obtain through discovery." },
  { domain: "insurance", recordType: "inspection_report", recordDescription: "Property or damage inspection report prepared by or for the insurer.", typicalKeywords: ["inspection report", "damage assessment", "property inspection", "field inspection", "independent adjuster report"], retentionNotes: "May be shared with policyholder upon request. Full file through discovery." },
  { domain: "insurance", recordType: "oic_complaint_file", recordDescription: "Complaint file at the WA Office of the Insurance Commissioner, including insurer response and OIC findings.", typicalKeywords: ["OIC complaint", "insurance commissioner complaint", "regulatory complaint", "consumer complaint"], retentionNotes: "Public record. Available through OIC public records request." },
  // Elder Abuse
  { domain: "elderabuse", recordType: "facility_inspection_report", recordDescription: "State inspection report documenting compliance with licensing standards, deficiencies found, and corrective action plans.", typicalKeywords: ["inspection report", "survey report", "deficiency", "corrective action", "licensing inspection"], retentionNotes: "Public record. Searchable online at DOH facilities inspection search." },
  { domain: "elderabuse", recordType: "complaint_investigation", recordDescription: "Investigation report for complaints filed against a care facility, including findings and any enforcement actions.", typicalKeywords: ["complaint investigation", "complaint report", "facility complaint", "abuse investigation", "neglect investigation"], retentionNotes: "Public record through DOH. Some details may be redacted for privacy." },
  { domain: "elderabuse", recordType: "care_plan", recordDescription: "Individualized care plan for the resident, including medical needs, medications, activities, and goals.", typicalKeywords: ["care plan", "service plan", "individual plan", "treatment plan", "nursing care plan"], retentionNotes: "Facility record. Family/legal representative may request from facility. Not a public record." },
  { domain: "elderabuse", recordType: "incident_report", recordDescription: "Internal facility report documenting incidents such as falls, injuries, medication errors, or behavioral events.", typicalKeywords: ["incident report", "occurrence report", "event report", "accident report", "fall report"], retentionNotes: "Facility record. May be obtainable through discovery or regulatory complaint." },
  { domain: "elderabuse", recordType: "staffing_logs", recordDescription: "Records of staffing levels, including nurse-to-patient ratios, shift coverage, and staff qualifications.", typicalKeywords: ["staffing log", "staffing records", "nurse staffing", "staff schedule", "staffing ratio"], retentionNotes: "CMS requires nursing homes to submit staffing data. Some data available through CMS Care Compare." },
  { domain: "elderabuse", recordType: "licensing_records", recordDescription: "Facility licensing records including application, license status, ownership information, and any enforcement history.", typicalKeywords: ["licensing", "license", "facility license", "ownership", "administrator"], retentionNotes: "Public record through DOH. License status searchable online." }
];

// ─── 4. Agency-Record Mappings ───
// Format: [agencyIndex, recordTypeIndex, statuteIndex, confidence]
// Indices are 1-based (matching auto-increment IDs)
const mappings = [
  // Police Misconduct → SPD (agency 1)
  [1, 1, 1, "high"],    // SPD → incident_report → RCW 42.56
  [1, 3, 1, "high"],    // SPD → body_camera_footage → RCW 42.56
  [1, 4, 1, "high"],    // SPD → dispatch_logs → RCW 42.56
  [1, 5, 1, "high"],    // SPD → use_of_force_report → RCW 42.56
  // Police Misconduct → OPA (agency 2)
  [2, 2, 1, "high"],    // OPA → internal_affairs_file → RCW 42.56
  [2, 6, 1, "high"],    // OPA → complaint_history → RCW 42.56
  // Police Misconduct → OIG (agency 3)
  [3, 2, 1, "medium"],  // OIG → internal_affairs_file (oversight) → RCW 42.56
  // Police Misconduct → King County Prosecutor (agency 4)
  [4, 1, 1, "medium"],  // KC Prosecutor → incident_report (if charged) → RCW 42.56
  // ICWA → DCYF (agency 5)
  [5, 7, 2, "high"],    // DCYF → tribal_notice → RCW 13.38
  [5, 8, 2, "high"],    // DCYF → active_efforts_documentation → RCW 13.38
  [5, 9, 2, "high"],    // DCYF → placement_preference_documentation → RCW 13.38
  [5, 10, 2, "medium"], // DCYF → dependency_petition → RCW 13.38
  // ICWA → County Superior Court (agency 6)
  [6, 10, 2, "high"],   // Court → dependency_petition → RCW 13.38
  [6, 11, 2, "high"],   // Court → qualified_expert_witness_testimony → RCW 13.38
  [6, 12, 2, "high"],   // Court → court_orders → RCW 13.38
  // Insurance → OIC (agency 7)
  [7, 18, 3, "high"],   // OIC → oic_complaint_file → RCW 48
  // Elder Abuse → DOH (agency 8)
  [8, 19, 4, "high"],   // DOH → facility_inspection_report → RCW 18.51
  [8, 20, 4, "high"],   // DOH → complaint_investigation → RCW 18.51
  [8, 24, 4, "high"],   // DOH → licensing_records → RCW 18.51
  // Elder Abuse → DSHS/APS (agency 9)
  [9, 20, 4, "high"],   // APS → complaint_investigation → RCW 18.51
  [9, 22, 4, "medium"], // APS → incident_report → RCW 18.51
  // Elder Abuse → LTC Ombudsman (agency 10)
  [10, 20, 4, "medium"], // Ombudsman → complaint_investigation → RCW 18.51
];

// ─── Generate SQL ───
function esc(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

let sql = "-- AKB Seed Data: 4 domains × Washington State\n\n";

// Statutes
sql += "-- Statutes\n";
for (const s of statutes) {
  sql += `INSERT INTO foia_statutes (stateCode, lawName, statuteReference, responseDeadlineDays, appealDeadlineDays, feeWaiverAvailable, expeditedProcessingAvailable, notes) VALUES (${esc(s.stateCode)}, ${esc(s.lawName)}, ${esc(s.statuteReference)}, ${esc(s.responseDeadlineDays)}, ${esc(s.appealDeadlineDays)}, ${esc(s.feeWaiverAvailable)}, ${esc(s.expeditedProcessingAvailable)}, ${esc(s.notes)});\n`;
}

// Agencies
sql += "\n-- Agencies\n";
for (const a of agencies) {
  sql += `INSERT INTO foia_agencies (stateCode, jurisdictionLevel, agencyName, agencyComponent, portalUrl, email, mailingAddress, submissionMethods, notes) VALUES (${esc(a.stateCode)}, ${esc(a.jurisdictionLevel)}, ${esc(a.agencyName)}, ${esc(a.agencyComponent)}, ${esc(a.portalUrl)}, ${esc(a.email)}, ${esc(a.mailingAddress)}, ${esc(a.submissionMethods)}, ${esc(a.notes)});\n`;
}

// Record Types
sql += "\n-- Record Types\n";
for (const r of recordTypes) {
  sql += `INSERT INTO foia_record_types (domain, recordType, recordDescription, typicalKeywords, retentionNotes) VALUES (${esc(r.domain)}, ${esc(r.recordType)}, ${esc(r.recordDescription)}, ${esc(r.typicalKeywords)}, ${esc(r.retentionNotes)});\n`;
}

// Agency-Record Mappings
sql += "\n-- Agency-Record Mappings\n";
for (const [agencyId, recordTypeId, statuteId, confidence] of mappings) {
  sql += `INSERT INTO foia_agency_records (agencyId, recordTypeId, statuteId, confidence) VALUES (${agencyId}, ${recordTypeId}, ${statuteId}, ${esc(confidence)});\n`;
}

console.log(sql);
