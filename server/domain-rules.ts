/**
 * Domain Obligation Rules — deterministic rule sets that define what records
 * an agency/institution is REQUIRED to produce for each domain.
 *
 * These are NOT the same as document-checklists.ts (which tells users what to gather).
 * These rules define what the ENGINE expects to find in the evidence, and when
 * a required record is absent, the engine flags it as a "missing record" gap.
 *
 * Each rule has:
 *   - recordType: machine-readable identifier
 *   - label: human-readable name
 *   - description: what this record is and why it matters
 *   - legalBasis: the statute, regulation, or standard that requires this record
 *   - severity: how critical the absence is (critical = likely FOIA-worthy, important = strengthens case, helpful = nice to have)
 *   - detectionKeywords: terms the engine should look for in extracted text to determine if this record exists
 *   - detectionEntities: entity types from the extraction pipeline that indicate this record exists
 *   - agencyType: what kind of agency typically holds this record
 *   - foiaEligible: whether this record can be obtained via FOIA/public records request
 */

// ─── Types ───

export type Severity = "critical" | "important" | "helpful";

export interface ObligationRule {
  recordType: string;
  label: string;
  description: string;
  legalBasis: string;
  severity: Severity;
  detectionKeywords: string[];
  detectionEntities: string[];
  agencyType: string;
  foiaEligible: boolean;
}

export interface DomainRuleSet {
  domain: string;
  displayName: string;
  description: string;
  rules: ObligationRule[];
}

// ─── Police Misconduct ───

const policeMisconductRules: DomainRuleSet = {
  domain: "policemisconduct",
  displayName: "Police Misconduct",
  description: "Records that law enforcement agencies are required to maintain when force is used, complaints are filed, or misconduct is alleged.",
  rules: [
    {
      recordType: "incident_report",
      label: "Official Incident Report",
      description: "The department's official report documenting the encounter. Required for any use of force, arrest, or citizen contact resulting in complaint.",
      legalBasis: "Department policy (universal); state records retention statutes",
      severity: "critical",
      detectionKeywords: ["incident report", "police report", "case number", "report number", "reporting officer", "narrative of events", "offense report"],
      detectionEntities: ["incident_report", "police_report", "case_number"],
      agencyType: "Law enforcement agency",
      foiaEligible: true,
    },
    {
      recordType: "body_camera_footage",
      label: "Body-Worn Camera Footage",
      description: "Video from officer body cameras during the encounter. Most departments with BWC programs require activation during all enforcement contacts.",
      legalBasis: "Department BWC policy; state BWC statutes (varies by state — e.g., CO SB 20-217, IL SAFE-T Act)",
      severity: "critical",
      detectionKeywords: ["body camera", "body cam", "BWC", "body-worn camera", "video footage", "camera footage", "dash cam", "dashcam"],
      detectionEntities: ["video_evidence", "body_camera"],
      agencyType: "Law enforcement agency",
      foiaEligible: true,
    },
    {
      recordType: "use_of_force_report",
      label: "Use of Force Report",
      description: "Separate documentation required whenever an officer uses physical force beyond routine handcuffing. Must detail the type and level of force, justification, and outcome.",
      legalBasis: "Department use-of-force policy; 34 USC § 12602 (federal reporting); state statutes (e.g., CA AB 71, NJ AG Directive 2019-4)",
      severity: "critical",
      detectionKeywords: ["use of force", "force report", "force used", "level of force", "force continuum", "taser", "OC spray", "baton", "firearm discharged", "physical control", "takedown"],
      detectionEntities: ["use_of_force", "force_type", "injury"],
      agencyType: "Law enforcement agency",
      foiaEligible: true,
    },
    {
      recordType: "internal_affairs_complaint",
      label: "Internal Affairs Complaint File",
      description: "The formal complaint record and investigation file from the department's internal affairs or professional standards division.",
      legalBasis: "Department IA policy; state law (e.g., CA Penal Code § 832.5 requires maintenance of citizen complaints)",
      severity: "critical",
      detectionKeywords: ["internal affairs", "IA complaint", "citizen complaint", "professional standards", "complaint investigation", "sustained", "not sustained", "unfounded", "exonerated"],
      detectionEntities: ["ia_complaint", "complaint_number", "investigation"],
      agencyType: "Law enforcement agency — Internal Affairs division",
      foiaEligible: true,
    },
    {
      recordType: "dispatch_records",
      label: "911 / CAD / Dispatch Records",
      description: "Computer-Aided Dispatch records and 911 call recordings documenting the initial call for service, dispatch time, and officer assignment.",
      legalBasis: "State records retention; department policy",
      severity: "important",
      detectionKeywords: ["911", "dispatch", "CAD", "call for service", "dispatch log", "radio log", "dispatch record", "911 call"],
      detectionEntities: ["dispatch_record", "911_call", "call_time"],
      agencyType: "911 center / Law enforcement agency",
      foiaEligible: true,
    },
    {
      recordType: "officer_disciplinary_history",
      label: "Officer Disciplinary History",
      description: "Prior complaints, disciplinary actions, and sustained findings against the involved officer(s). Pattern evidence is critical for establishing a custom or practice.",
      legalBasis: "42 USC § 1983 (Monell liability — pattern evidence); state disclosure laws (e.g., CA SB 1421, NY 50-a repeal)",
      severity: "important",
      detectionKeywords: ["prior complaints", "disciplinary history", "prior incidents", "pattern", "sustained complaints", "officer history", "Brady list", "Giglio"],
      detectionEntities: ["officer_name", "prior_complaint", "disciplinary_action"],
      agencyType: "Law enforcement agency; POST commission",
      foiaEligible: true,
    },
    {
      recordType: "medical_treatment_records",
      label: "Medical Treatment Records (Injuries)",
      description: "Medical records documenting injuries sustained during the encounter — either by the subject or the officer. Departments are required to document and provide medical treatment.",
      legalBasis: "14th Amendment due process (deliberate indifference standard); department policy requiring medical screening after force",
      severity: "important",
      detectionKeywords: ["medical treatment", "hospital", "emergency room", "injuries", "medical records", "treated for", "ambulance", "paramedic", "medical screening"],
      detectionEntities: ["injury", "medical_record", "hospital", "treatment"],
      agencyType: "Medical provider / Law enforcement agency",
      foiaEligible: false,
    },
    {
      recordType: "witness_statements",
      label: "Witness Statements",
      description: "Statements taken from civilian witnesses to the encounter. Investigating officers are expected to canvass for and document witness accounts.",
      legalBasis: "Department investigative policy; Brady v. Maryland (prosecution must disclose exculpatory evidence)",
      severity: "important",
      detectionKeywords: ["witness statement", "witness", "bystander", "civilian witness", "statement taken", "witness interview", "witness account"],
      detectionEntities: ["witness", "witness_statement", "civilian_name"],
      agencyType: "Law enforcement agency",
      foiaEligible: true,
    },
  ],
};

// ─── ICWA (Indian Child Welfare Act) ───

const icwaRules: DomainRuleSet = {
  domain: "icwa",
  displayName: "Indian Child Welfare Act (ICWA)",
  description: "Federal requirements under 25 USC §§ 1901–1963 that state agencies must follow when an Indian child is involved in a child custody proceeding.",
  rules: [
    {
      recordType: "tribal_notice",
      label: "Formal Notice to Tribe",
      description: "The state agency must send formal written notice to the child's tribe (or the BIA if the tribe is unknown) by registered mail with return receipt. Notice must include the child's name, birthdate, tribal affiliation, and a copy of the petition.",
      legalBasis: "25 USC § 1912(a); 25 CFR § 23.111",
      severity: "critical",
      detectionKeywords: ["notice to tribe", "ICWA notice", "tribal notification", "registered mail", "return receipt", "BIA notice", "notice of proceeding", "notice of hearing"],
      detectionEntities: ["tribal_notice", "tribe_name", "bia_notification"],
      agencyType: "State child welfare agency / Court",
      foiaEligible: true,
    },
    {
      recordType: "active_efforts_documentation",
      label: "Active Efforts Documentation",
      description: "The state must document 'active efforts' to provide remedial services and rehabilitative programs to prevent the breakup of the Indian family. This is a higher standard than 'reasonable efforts' — it requires affirmative, active, thorough, and timely efforts.",
      legalBasis: "25 USC § 1912(d); 25 CFR § 23.120",
      severity: "critical",
      detectionKeywords: ["active efforts", "remedial services", "rehabilitative programs", "prevent breakup", "family preservation", "active effort", "services provided", "efforts to prevent"],
      detectionEntities: ["active_efforts", "service_plan", "remedial_service"],
      agencyType: "State child welfare agency",
      foiaEligible: true,
    },
    {
      recordType: "qualified_expert_witness",
      label: "Qualified Expert Witness Testimony",
      description: "Before foster care placement or termination of parental rights, a qualified expert witness must testify that continued custody by the parent is likely to result in serious emotional or physical damage to the child. The expert must be qualified by the tribe.",
      legalBasis: "25 USC § 1912(e)–(f); 25 CFR § 23.122",
      severity: "critical",
      detectionKeywords: ["qualified expert", "expert witness", "expert testimony", "QEW", "serious emotional or physical damage", "beyond a reasonable doubt", "clear and convincing"],
      detectionEntities: ["expert_witness", "expert_testimony", "qew"],
      agencyType: "Court / Tribal authority",
      foiaEligible: true,
    },
    {
      recordType: "placement_preference_compliance",
      label: "Placement Preference Compliance",
      description: "ICWA establishes mandatory placement preferences: (1) extended family, (2) foster home licensed by the tribe, (3) Indian foster home, (4) institution approved by the tribe. Deviation requires documented good cause.",
      legalBasis: "25 USC § 1915(a)–(b); 25 CFR § 23.129–132",
      severity: "critical",
      detectionKeywords: ["placement preference", "extended family", "tribal foster", "Indian foster home", "good cause", "placement decision", "deviation from preference", "ICWA placement"],
      detectionEntities: ["placement_decision", "foster_placement", "relative_placement"],
      agencyType: "State child welfare agency / Court",
      foiaEligible: true,
    },
    {
      recordType: "tribal_membership_verification",
      label: "Tribal Membership / Eligibility Verification",
      description: "Documentation verifying the child's tribal membership or eligibility for membership. The tribe is the sole authority on membership determinations.",
      legalBasis: "25 USC § 1903(4); 25 CFR § 23.108",
      severity: "critical",
      detectionKeywords: ["tribal membership", "enrollment", "eligible for membership", "tribal affiliation", "tribal citizen", "membership verification", "enrollment number"],
      detectionEntities: ["tribal_membership", "enrollment_status", "tribe_name"],
      agencyType: "Tribal government",
      foiaEligible: false,
    },
    {
      recordType: "transfer_request_response",
      label: "Transfer to Tribal Court Request/Response",
      description: "Either parent, the tribe, or the Indian custodian may request transfer to tribal court. The state court must transfer unless either parent objects, the tribal court declines, or good cause exists not to transfer.",
      legalBasis: "25 USC § 1911(b); 25 CFR § 23.115–118",
      severity: "important",
      detectionKeywords: ["transfer to tribal court", "tribal jurisdiction", "tribal court", "transfer request", "exclusive jurisdiction", "concurrent jurisdiction", "declined transfer"],
      detectionEntities: ["transfer_request", "tribal_court", "jurisdiction"],
      agencyType: "State court / Tribal court",
      foiaEligible: true,
    },
    {
      recordType: "icwa_inquiry_documentation",
      label: "ICWA Inquiry / Reason to Know Documentation",
      description: "The court and agency must ask at the earliest opportunity whether the child is or may be an Indian child. This inquiry must be documented.",
      legalBasis: "25 CFR § 23.107; state ICWA statutes",
      severity: "important",
      detectionKeywords: ["ICWA inquiry", "reason to know", "Indian child inquiry", "tribal heritage", "Native American ancestry", "asked about tribal affiliation"],
      detectionEntities: ["icwa_inquiry", "ancestry_question"],
      agencyType: "State child welfare agency / Court",
      foiaEligible: true,
    },
  ],
};

// ─── Insurance Denial ───

const insuranceDenialRules: DomainRuleSet = {
  domain: "insurance",
  displayName: "Insurance Claim Denial",
  description: "Records that insurance companies are required to maintain and produce when a claim is filed and denied. Regulated by state insurance codes and the NAIC Model Unfair Claims Settlement Practices Act.",
  rules: [
    {
      recordType: "denial_letter_with_basis",
      label: "Written Denial with Specific Basis",
      description: "The insurer must provide a written denial that cites the specific policy provision, exclusion, or condition relied upon. A vague or generic denial may itself constitute bad faith.",
      legalBasis: "NAIC Model Unfair Claims Settlement Practices Act § 4(D); state insurance codes (e.g., CA Ins. Code § 790.03(h))",
      severity: "critical",
      detectionKeywords: ["denial letter", "claim denied", "not covered", "exclusion", "policy provision", "basis for denial", "reason for denial", "coverage determination"],
      detectionEntities: ["denial_letter", "denial_reason", "policy_exclusion"],
      agencyType: "Insurance company",
      foiaEligible: false,
    },
    {
      recordType: "complete_claims_file",
      label: "Complete Claims File",
      description: "The insurer's internal file containing all notes, evaluations, correspondence, and decision documents related to the claim. Policyholders have a right to request their claims file in most states.",
      legalBasis: "State insurance regulations; litigation discovery; state unfair claims practices acts",
      severity: "critical",
      detectionKeywords: ["claims file", "adjuster notes", "claim notes", "internal notes", "claims log", "claim diary", "adjuster report", "claim evaluation"],
      detectionEntities: ["claims_file", "adjuster_notes", "claim_number"],
      agencyType: "Insurance company",
      foiaEligible: false,
    },
    {
      recordType: "timely_acknowledgment",
      label: "Timely Claim Acknowledgment",
      description: "The insurer must acknowledge receipt of the claim within a specified period (typically 15–30 days depending on state). Failure to acknowledge is a red flag for bad faith.",
      legalBasis: "NAIC Model Act § 4(A); state prompt-pay statutes (e.g., TX Ins. Code § 542.055 — 15 days)",
      severity: "important",
      detectionKeywords: ["acknowledgment", "claim received", "claim acknowledged", "receipt of claim", "we received your claim", "claim number assigned"],
      detectionEntities: ["claim_acknowledgment", "receipt_date"],
      agencyType: "Insurance company",
      foiaEligible: false,
    },
    {
      recordType: "investigation_documentation",
      label: "Investigation Documentation",
      description: "The insurer must conduct a reasonable investigation before denying a claim. This includes documenting what was investigated, what evidence was reviewed, and the basis for the coverage determination.",
      legalBasis: "NAIC Model Act § 4(D); state bad faith standards (e.g., Egan v. Mutual of Omaha, Anderson v. Continental Ins. Co.)",
      severity: "critical",
      detectionKeywords: ["investigation", "investigated", "reviewed", "evaluated", "inspection", "independent adjuster", "field adjuster", "SIU", "special investigation"],
      detectionEntities: ["investigation", "adjuster_name", "inspection_report"],
      agencyType: "Insurance company",
      foiaEligible: false,
    },
    {
      recordType: "independent_medical_exam",
      label: "Independent Medical Examination (if health/disability)",
      description: "If the insurer ordered an IME or peer review to support the denial, those records must be available. The qualifications of the reviewer and the basis for their opinion are relevant to bad faith analysis.",
      legalBasis: "State insurance regulations; ERISA § 503 (for employer-sponsored plans)",
      severity: "important",
      detectionKeywords: ["independent medical exam", "IME", "peer review", "medical review", "utilization review", "medical necessity determination", "independent review"],
      detectionEntities: ["ime_report", "peer_review", "medical_reviewer"],
      agencyType: "Insurance company / Third-party reviewer",
      foiaEligible: false,
    },
    {
      recordType: "policy_document",
      label: "Complete Policy with Declarations Page",
      description: "The full insurance policy including declarations page, coverage limits, exclusions, endorsements, and conditions. The insurer must provide a copy upon request.",
      legalBasis: "State insurance codes (universal requirement); contract law",
      severity: "critical",
      detectionKeywords: ["policy", "declarations page", "coverage limit", "exclusion", "endorsement", "policy period", "deductible", "premium", "insuring agreement"],
      detectionEntities: ["policy_document", "coverage_limit", "policy_number"],
      agencyType: "Insurance company",
      foiaEligible: false,
    },
    {
      recordType: "appeals_process_notice",
      label: "Appeals Process Notice",
      description: "The denial must include information about the policyholder's right to appeal and the process for doing so. For ERISA plans, this is a federal requirement.",
      legalBasis: "ERISA § 503; 29 CFR § 2560.503-1; state insurance codes",
      severity: "important",
      detectionKeywords: ["appeal", "right to appeal", "appeal process", "internal appeal", "external review", "grievance", "reconsideration", "appeal deadline"],
      detectionEntities: ["appeal_notice", "appeal_deadline", "appeal_process"],
      agencyType: "Insurance company",
      foiaEligible: false,
    },
  ],
};

// ─── Elder Abuse / Nursing Home ───

const elderAbuseRules: DomainRuleSet = {
  domain: "elderabuse",
  displayName: "Elder Abuse / Nursing Home Neglect",
  description: "Records that nursing homes, assisted living facilities, and oversight agencies are required to maintain. Regulated by CMS Conditions of Participation, state licensing, and the Older Americans Act.",
  rules: [
    {
      recordType: "care_plan",
      label: "Individualized Care Plan",
      description: "Federal law requires nursing homes to develop a comprehensive, individualized care plan for each resident within 7 days of admission, with quarterly updates. The care plan must address all identified needs.",
      legalBasis: "42 CFR § 483.21 (CMS Conditions of Participation); Omnibus Budget Reconciliation Act of 1987 (OBRA '87)",
      severity: "critical",
      detectionKeywords: ["care plan", "individualized care", "care conference", "care plan meeting", "plan of care", "nursing care plan", "MDS assessment", "comprehensive assessment"],
      detectionEntities: ["care_plan", "care_conference", "mds_assessment"],
      agencyType: "Nursing home / Assisted living facility",
      foiaEligible: false,
    },
    {
      recordType: "incident_reports",
      label: "Incident / Accident Reports",
      description: "Facilities must document all incidents including falls, injuries, medication errors, elopements, and altercations. These reports must be filed with the state within specified timeframes for serious incidents.",
      legalBasis: "42 CFR § 483.12(c) (reporting requirements); state licensing regulations",
      severity: "critical",
      detectionKeywords: ["incident report", "accident report", "fall", "injury report", "medication error", "elopement", "altercation", "unusual occurrence", "adverse event"],
      detectionEntities: ["incident_report", "fall", "injury", "medication_error"],
      agencyType: "Nursing home / State licensing agency",
      foiaEligible: true,
    },
    {
      recordType: "state_inspection_reports",
      label: "State Survey / Inspection Reports",
      description: "CMS requires annual unannounced inspections of all Medicare/Medicaid-certified nursing homes. Results are public record and include deficiency citations with severity ratings.",
      legalBasis: "42 USC § 1395i-3(g); 42 CFR § 488.301 et seq.; CMS State Operations Manual",
      severity: "critical",
      detectionKeywords: ["state survey", "inspection report", "deficiency", "citation", "Form 2567", "statement of deficiencies", "plan of correction", "survey results", "CMS inspection"],
      detectionEntities: ["inspection_report", "deficiency_citation", "survey_date"],
      agencyType: "State health department / CMS",
      foiaEligible: true,
    },
    {
      recordType: "staffing_records",
      label: "Staffing Records / Payroll-Based Journal",
      description: "Nursing homes must submit staffing data to CMS via the Payroll-Based Journal (PBJ) system. Staffing levels are directly correlated with quality of care — understaffing is a primary indicator of neglect.",
      legalBasis: "42 CFR § 483.70(q); ACA § 6106; CMS PBJ reporting requirements",
      severity: "important",
      detectionKeywords: ["staffing", "staffing levels", "nurse-to-patient ratio", "PBJ", "payroll-based journal", "understaffed", "staffing hours", "HPRD", "hours per resident day", "RN hours"],
      detectionEntities: ["staffing_data", "staffing_ratio", "nurse_hours"],
      agencyType: "Nursing home / CMS",
      foiaEligible: true,
    },
    {
      recordType: "medication_administration_records",
      label: "Medication Administration Records (MAR)",
      description: "Facilities must maintain detailed records of all medications administered, including time, dose, route, and the administering nurse. Gaps or patterns in the MAR can indicate neglect.",
      legalBasis: "42 CFR § 483.45 (pharmacy services); state nursing practice acts",
      severity: "important",
      detectionKeywords: ["medication record", "MAR", "medication administration", "medication log", "drug administration", "medication error", "missed medication", "PRN medication"],
      detectionEntities: ["medication_record", "medication_name", "administration_time"],
      agencyType: "Nursing home",
      foiaEligible: false,
    },
    {
      recordType: "aps_investigation",
      label: "Adult Protective Services Investigation Report",
      description: "When elder abuse is reported, APS investigates and produces a report with findings. These reports document the investigation, evidence gathered, and determination (substantiated/unsubstantiated).",
      legalBasis: "Older Americans Act § 721; state APS statutes",
      severity: "critical",
      detectionKeywords: ["APS", "Adult Protective Services", "abuse investigation", "neglect investigation", "substantiated", "unsubstantiated", "protective services", "abuse report"],
      detectionEntities: ["aps_report", "aps_investigation", "abuse_finding"],
      agencyType: "Adult Protective Services (county/state)",
      foiaEligible: true,
    },
    {
      recordType: "ombudsman_complaint",
      label: "Long-Term Care Ombudsman Complaint",
      description: "The Long-Term Care Ombudsman program investigates complaints on behalf of residents. Complaint records and investigation outcomes are maintained by the state ombudsman office.",
      legalBasis: "Older Americans Act § 712; 45 CFR Part 1324",
      severity: "important",
      detectionKeywords: ["ombudsman", "ombudsman complaint", "ombudsman investigation", "resident complaint", "long-term care ombudsman", "complaint filed"],
      detectionEntities: ["ombudsman_complaint", "complaint_number"],
      agencyType: "State Long-Term Care Ombudsman",
      foiaEligible: true,
    },
    {
      recordType: "abuse_prevention_program",
      label: "Facility Abuse Prevention Program",
      description: "Nursing homes are required to have a written abuse prevention program including staff training, screening, and reporting procedures. Absence of this program is itself a deficiency.",
      legalBasis: "42 CFR § 483.12(b) (abuse prevention); CMS F-tags F600–F610",
      severity: "important",
      detectionKeywords: ["abuse prevention", "abuse policy", "abuse prevention program", "staff training", "background check", "abuse prohibition", "reporting procedure"],
      detectionEntities: ["abuse_prevention_policy", "training_record"],
      agencyType: "Nursing home",
      foiaEligible: false,
    },
  ],
};

// ─── Rule Set Registry ───

const DOMAIN_RULE_SETS: Record<string, DomainRuleSet> = {
  policemisconduct: policeMisconductRules,
  icwa: icwaRules,
  insurance: insuranceDenialRules,
  elderabuse: elderAbuseRules,
  // Aliases — some pipeline types map to the same rule set
  nursing: elderAbuseRules,
  guardianship: elderAbuseRules,
};

/**
 * Get the obligation rule set for a given pipeline type (domain).
 * Returns null if no rules are defined for this domain yet.
 */
export function getDomainRules(pipelineType: string): DomainRuleSet | null {
  return DOMAIN_RULE_SETS[pipelineType] || null;
}

/**
 * Get all domains that have obligation rules defined.
 */
export function getDomainsWithRules(): string[] {
  // Deduplicate (aliases point to same object)
  const seen = new Set<DomainRuleSet>();
  const domains: string[] = [];
  for (const [key, ruleSet] of Object.entries(DOMAIN_RULE_SETS)) {
    if (!seen.has(ruleSet)) {
      seen.add(ruleSet);
      domains.push(key);
    }
  }
  return domains;
}

/**
 * Get all rule sets (deduplicated).
 */
export function getAllRuleSets(): DomainRuleSet[] {
  const seen = new Set<DomainRuleSet>();
  const result: DomainRuleSet[] = [];
  for (const ruleSet of Object.values(DOMAIN_RULE_SETS)) {
    if (!seen.has(ruleSet)) {
      seen.add(ruleSet);
      result.push(ruleSet);
    }
  }
  return result;
}
