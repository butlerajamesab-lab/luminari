/**
 * Luminari — Intake Auto-Detection Engine
 *
 * Transforms intake from a menu into a conversation. When a user describes
 * their situation in natural language, this engine scores all 158 canonical
 * pipelines against their answers and returns confidence-ranked suggestions.
 *
 * Architecture:
 *   1. Signal Keywords: Each pipeline has weighted keyword/phrase signals
 *   2. Question Flow: 3-5 adaptive questions that narrow the search space
 *   3. Scoring Engine: Multi-factor scoring (keyword match + category affinity + entity signals)
 *   4. Confidence Ranking: Top-N suggestions with confidence scores and explanations
 *
 * Integration:
 *   - Pipeline Resolver: Uses canonical IDs from pipeline_types.json
 *   - Lens Engine: Pre-activates intake_pre_lens based on detected situation
 *   - Intake UI: Feeds suggestions back to the conversational flow
 *
 * Zero coupling to analysis pipeline. Pure functions over config data + user input.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A single keyword/phrase signal that indicates a pipeline match. */
export interface SignalKeyword {
  /** The keyword or phrase to match (case-insensitive). */
  term: string;
  /** Weight of this signal (1-10). Higher = stronger indicator. */
  weight: number;
  /** If true, this is a negative signal (reduces score). */
  negative?: boolean;
}

/** Signal profile for a single pipeline. */
export interface PipelineSignalProfile {
  pipeline_id: string;
  category: string;
  label: string;
  /** Primary keywords that strongly indicate this pipeline. */
  primary_signals: SignalKeyword[];
  /** Secondary keywords that weakly indicate this pipeline. */
  secondary_signals: SignalKeyword[];
  /** Entity types that indicate this pipeline (e.g., "police_officer", "landlord"). */
  entity_signals: string[];
  /** Document types that indicate this pipeline (e.g., "lease", "denial_letter"). */
  document_signals: string[];
  /** Intake pre-lens situation IDs that map to this pipeline. */
  pre_lens_situations?: string[];
}

/** A scored pipeline suggestion. */
export interface PipelineSuggestion {
  pipeline_id: string;
  category: string;
  label: string;
  confidence: number;       // 0.0 - 1.0
  confidence_label: "high" | "medium" | "low";
  match_reasons: string[];  // Human-readable reasons for the match
  matched_signals: string[]; // Which signals fired
}

/** The questionnaire question definition. */
export interface IntakeQuestion {
  id: string;
  text: string;
  /** Which question to ask next based on detected category (adaptive flow). */
  follow_up_for?: string[];
  /** If true, this question is always asked. */
  always?: boolean;
  /** Order in the flow (lower = earlier). */
  order: number;
}

/** User's answers to the questionnaire. */
export interface IntakeAnswers {
  /** Free-text description of what happened. */
  what_happened?: string;
  /** Who is involved (entities). */
  who_involved?: string;
  /** What documents they have. */
  documents_available?: string;
  /** Where it happened (location/jurisdiction). */
  where?: string;
  /** Any additional context. */
  additional_context?: string;
  /** Raw combined text of all answers (for scoring). */
  combined_text?: string;
}

/** Result of auto-detection. */
export interface AutoDetectResult {
  /** Top pipeline suggestions, ranked by confidence. */
  suggestions: PipelineSuggestion[];
  /** Detected category affinity (which broad category the situation falls into). */
  category_affinity: { category: string; score: number }[];
  /** Suggested intake pre-lens situations based on signals. */
  suggested_pre_lenses: string[];
  /** Which questions should be asked next (adaptive flow). */
  next_questions: IntakeQuestion[];
  /** Whether we have enough confidence to make a recommendation. */
  ready_to_recommend: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: "what_happened",
    text: "In your own words, what's going on? Don't worry about getting it perfect — just tell me what happened.",
    always: true,
    order: 1,
  },
  {
    id: "who_involved",
    text: "Who's involved in this situation? For example — a company, a government agency, a landlord, an employer, a family member, law enforcement?",
    always: true,
    order: 2,
  },
  {
    id: "documents_available",
    text: "Do you have any documents related to this? Things like letters, emails, contracts, medical records, court papers, bills — anything at all?",
    always: false,
    order: 3,
  },
  {
    id: "where",
    text: "Where did this happen? Knowing the state or location can help us understand which laws and protections apply.",
    always: false,
    order: 4,
    follow_up_for: ["tribal", "immigration", "housing", "employment"],
  },
  {
    id: "additional_context",
    text: "Is there anything else you'd like me to know? Any deadlines, court dates, or urgent concerns?",
    always: false,
    order: 5,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL PROFILES — KEYWORD MAPPINGS FOR ALL 158 PIPELINES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build signal profiles from pipeline_types.json + hardcoded keyword intelligence.
 * The keyword intelligence is the "secret sauce" — it maps natural language
 * descriptions to canonical pipeline IDs.
 */

interface SignalProfileConfig {
  primary: [string, number][];   // [term, weight]
  secondary: [string, number][];
  entities: string[];
  documents: string[];
  pre_lens?: string[];
}

/**
 * Master signal map: pipeline_id → signal configuration.
 * Each pipeline has primary signals (strong indicators, weight 5-10)
 * and secondary signals (weak indicators, weight 1-4).
 */
const SIGNAL_MAP: Record<string, SignalProfileConfig> = {
  // ═══ JUSTICE & ACCOUNTABILITY ═══
  police_misconduct: {
    primary: [["police", 8], ["officer", 7], ["excessive force", 10], ["false arrest", 10], ["body camera", 9], ["badge", 7], ["brutality", 10], ["taser", 8], ["pepper spray", 8]],
    secondary: [["pulled over", 4], ["handcuffs", 3], ["detained", 4], ["patrol", 3], ["911", 3], ["internal affairs", 6], ["complaint", 3]],
    entities: ["police_officer", "sheriff", "deputy", "trooper", "detective"],
    documents: ["police_report", "body_camera", "complaint", "internal_affairs"],
    pre_lens: ["police_misconduct"],
  },
  prosecutorial_misconduct: {
    primary: [["prosecutor", 9], ["district attorney", 9], ["DA", 7], ["withheld evidence", 10], ["brady violation", 10], ["suppressed", 8], ["exculpatory", 9]],
    secondary: [["charges", 4], ["indictment", 5], ["grand jury", 5], ["plea deal", 4], ["trial", 3]],
    entities: ["prosecutor", "district_attorney", "assistant_da"],
    documents: ["court_filing", "discovery", "trial_transcript"],
  },
  judicial_misconduct: {
    primary: [["judge", 8], ["judicial", 8], ["ex parte", 10], ["bias", 7], ["recuse", 9], ["abuse of authority", 9]],
    secondary: [["courtroom", 4], ["bench", 3], ["ruling", 3], ["order", 2], ["hearing", 2]],
    entities: ["judge", "magistrate", "justice"],
    documents: ["court_order", "hearing_transcript", "judicial_complaint"],
  },
  wrongful_conviction: {
    primary: [["wrongful conviction", 10], ["innocent", 8], ["didn't do it", 9], ["DNA", 8], ["exoneration", 10], ["Brady material", 9], ["false confession", 10]],
    secondary: [["prison", 5], ["sentence", 4], ["appeal", 4], ["conviction", 5], ["trial", 3], ["evidence", 3]],
    entities: ["defendant", "inmate", "prisoner"],
    documents: ["trial_transcript", "appeal_filing", "dna_report", "witness_statement"],
  },
  whistleblower_retaliation: {
    primary: [["whistleblower", 10], ["reported wrongdoing", 9], ["retaliation", 8], ["fired for reporting", 10], ["qui tam", 9]],
    secondary: [["reported", 3], ["complained", 3], ["safety violation", 5], ["fraud", 4], ["cover up", 6]],
    entities: ["employer", "supervisor", "compliance_officer"],
    documents: ["complaint", "termination_letter", "hr_record"],
  },
  government_accountability: {
    primary: [["FOIA", 9], ["public records", 8], ["government", 6], ["agency", 5], ["transparency", 7], ["freedom of information", 10]],
    secondary: [["bureaucracy", 3], ["stonewalling", 5], ["redacted", 6], ["classified", 4]],
    entities: ["government_agency", "federal_agency", "state_agency"],
    documents: ["foia_request", "public_record", "agency_correspondence"],
    pre_lens: ["need_government_records"],
  },
  civil_rights_violation: {
    primary: [["civil rights", 10], ["discrimination", 8], ["equal protection", 9], ["due process", 8], ["constitutional", 7], ["14th amendment", 9]],
    secondary: [["rights", 3], ["violated", 4], ["unfair treatment", 5], ["bias", 4]],
    entities: ["government_official", "institution"],
    documents: ["complaint", "court_filing"],
  },
  public_corruption: {
    primary: [["bribery", 10], ["corruption", 9], ["embezzlement", 10], ["kickback", 9], ["conflict of interest", 8], ["pay to play", 9]],
    secondary: [["politician", 5], ["official", 3], ["campaign", 4], ["donation", 3], ["contract", 3]],
    entities: ["elected_official", "government_official"],
    documents: ["financial_record", "campaign_finance", "contract"],
  },
  criminal_case_review: {
    primary: [["criminal case", 8], ["sentencing error", 9], ["ineffective counsel", 10], ["appeal", 6], ["post-conviction", 9]],
    secondary: [["charged", 4], ["convicted", 5], ["sentence", 4], ["lawyer didn't", 6], ["attorney", 3]],
    entities: ["defendant", "defense_attorney", "judge"],
    documents: ["court_record", "sentencing_document", "appeal_filing"],
  },
  investigative_journalism: {
    primary: [["investigation", 6], ["journalism", 9], ["reporter", 8], ["expose", 7], ["public interest", 7], ["source documents", 8]],
    secondary: [["story", 3], ["article", 3], ["media", 3], ["records", 3], ["pattern", 4]],
    entities: ["journalist", "reporter", "editor"],
    documents: ["public_record", "source_document", "database"],
  },
  prison_conditions: {
    primary: [["prison", 8], ["jail", 7], ["inmate", 7], ["solitary confinement", 10], ["medical neglect", 9], ["correctional", 8]],
    secondary: [["locked up", 5], ["behind bars", 5], ["cell", 4], ["guard", 4], ["warden", 5]],
    entities: ["inmate", "prisoner", "correctional_officer", "warden"],
    documents: ["incident_report", "medical_record", "grievance"],
  },
  parole_probation_violation: {
    primary: [["parole", 9], ["probation", 9], ["violation", 6], ["revocation", 9], ["probation officer", 8]],
    secondary: [["conditions", 3], ["check-in", 4], ["drug test", 5], ["curfew", 4], ["ankle monitor", 6]],
    entities: ["parole_officer", "probation_officer"],
    documents: ["parole_order", "violation_report"],
  },
  use_of_force_review: {
    primary: [["use of force", 10], ["body camera", 8], ["shooting", 8], ["taser", 7], ["restraint", 7], ["chokehold", 10]],
    secondary: [["force", 4], ["physical", 3], ["injury", 3], ["policy", 3]],
    entities: ["police_officer", "suspect", "victim"],
    documents: ["body_camera", "use_of_force_report", "internal_review"],
  },
  civil_asset_forfeiture: {
    primary: [["asset forfeiture", 10], ["seized property", 9], ["civil forfeiture", 10], ["property seized", 9]],
    secondary: [["confiscated", 6], ["took my car", 7], ["took my money", 7], ["cash seizure", 8]],
    entities: ["law_enforcement", "property_owner"],
    documents: ["seizure_notice", "forfeiture_complaint", "property_receipt"],
  },
  wrongful_arrest: {
    primary: [["wrongful arrest", 10], ["false imprisonment", 10], ["mistaken identity", 9], ["unlawful detention", 10], ["arrested for nothing", 9]],
    secondary: [["arrested", 5], ["handcuffed", 5], ["booked", 4], ["held", 3]],
    entities: ["police_officer", "arrestee"],
    documents: ["arrest_report", "booking_record"],
  },

  // ═══ FAMILY LAW ═══
  domestic_violence: {
    primary: [["domestic violence", 10], ["abusive partner", 10], ["hitting me", 10], ["threatening me", 9], ["restraining order", 9], ["protective order", 9]],
    secondary: [["scared", 5], ["controlling", 6], ["isolating", 6], ["hurt me", 7], ["afraid", 5]],
    entities: ["partner", "spouse", "ex"],
    documents: ["police_report", "protective_order", "medical_record"],
    pre_lens: ["someone_is_threatening_me", "my_partner_is_controlling_me"],
  },
  custody: {
    primary: [["custody", 9], ["visitation", 8], ["parenting time", 8], ["custody agreement", 9], ["custody order", 9]],
    secondary: [["kids", 4], ["children", 4], ["co-parent", 5], ["family court", 6], ["parenting plan", 7]],
    entities: ["parent", "child", "family_court_judge"],
    documents: ["custody_order", "parenting_plan", "court_filing"],
    pre_lens: ["custody_fight"],
  },
  custody_dispute: {
    primary: [["custody battle", 10], ["fighting for custody", 10], ["custody modification", 9], ["relocation", 7]],
    secondary: [["other parent", 5], ["won't let me see", 8], ["keeping kids from me", 9], ["moved away", 5]],
    entities: ["parent", "child", "attorney"],
    documents: ["custody_order", "motion", "court_filing"],
    pre_lens: ["custody_fight"],
  },
  family_law: {
    primary: [["divorce", 8], ["separation", 7], ["family court", 8], ["alimony", 8], ["spousal support", 8], ["marital property", 8]],
    secondary: [["marriage", 4], ["spouse", 4], ["settlement", 4], ["mediation", 5]],
    entities: ["spouse", "attorney", "mediator"],
    documents: ["divorce_decree", "settlement_agreement", "financial_disclosure"],
  },
  child_abuse: {
    primary: [["child abuse", 10], ["child neglect", 10], ["hurting a child", 10], ["child is being hurt", 10]],
    secondary: [["bruises", 7], ["marks", 5], ["not being fed", 8], ["unsafe", 5], ["scared child", 7]],
    entities: ["child", "parent", "caregiver"],
    documents: ["medical_record", "school_record", "cps_report"],
    pre_lens: ["child_is_being_hurt"],
  },
  child_welfare: {
    primary: [["CPS", 9], ["child protective services", 10], ["DCFS", 9], ["child welfare", 9], ["removed my child", 10]],
    secondary: [["social worker", 6], ["case plan", 6], ["investigation", 4], ["substantiated", 6]],
    entities: ["social_worker", "case_worker", "parent", "child"],
    documents: ["cps_report", "case_plan", "court_order"],
    pre_lens: ["child_is_being_hurt"],
  },
  foster_care: {
    primary: [["foster care", 10], ["foster parent", 8], ["aging out", 9], ["foster system", 9], ["group home", 8]],
    secondary: [["placement", 5], ["foster", 6], ["caseworker", 5], ["CASA", 6]],
    entities: ["foster_parent", "case_worker", "child"],
    documents: ["placement_record", "case_plan", "court_order"],
  },
  juvenile_case: {
    primary: [["juvenile", 9], ["minor", 6], ["youth", 5], ["juvenile court", 10], ["juvenile detention", 9]],
    secondary: [["school discipline", 6], ["expelled", 6], ["suspended", 5], ["teen", 4], ["young person", 5]],
    entities: ["minor", "juvenile", "school_official", "probation_officer"],
    documents: ["school_record", "court_record", "probation_report"],
  },
  guardianship: {
    primary: [["guardianship", 10], ["conservatorship", 10], ["ward", 7], ["guardian", 8], ["incapacitated", 7]],
    secondary: [["can't make decisions", 6], ["someone else controls", 7], ["power of attorney", 6]],
    entities: ["guardian", "ward", "judge"],
    documents: ["guardianship_order", "accounting", "medical_record"],
  },
  parental_rights_termination: {
    primary: [["parental rights", 9], ["termination", 7], ["TPR", 10], ["terminate rights", 10]],
    secondary: [["adoption", 5], ["permanent custody", 6], ["reunification", 6]],
    entities: ["parent", "child", "agency"],
    documents: ["court_order", "case_plan", "petition"],
  },
  family_services_failure: {
    primary: [["family services", 8], ["agency failure", 8], ["didn't help", 6], ["failed to protect", 9]],
    secondary: [["services", 3], ["agency", 3], ["program", 3]],
    entities: ["agency", "case_worker"],
    documents: ["case_plan", "service_record"],
  },
  child_support_modification: {
    primary: [["child support", 10], ["support modification", 9], ["arrears", 8], ["back child support", 9]],
    secondary: [["payment", 3], ["income change", 5], ["lost job", 5]],
    entities: ["parent", "child"],
    documents: ["support_order", "income_record", "payment_history"],
  },
  adoption_disruption: {
    primary: [["adoption", 8], ["adoption disruption", 10], ["adoption failed", 10], ["adoption reversal", 9]],
    secondary: [["adopted child", 6], ["adoptive parent", 6], ["placement", 4]],
    entities: ["adoptive_parent", "child", "agency"],
    documents: ["adoption_decree", "placement_record"],
  },
  kinship_placement_dispute: {
    primary: [["kinship", 9], ["relative placement", 9], ["grandparent custody", 9], ["kinship care", 10]],
    secondary: [["grandmother", 5], ["grandfather", 5], ["aunt", 4], ["uncle", 4], ["relative", 4]],
    entities: ["relative", "grandparent", "child"],
    documents: ["placement_order", "background_check", "home_study"],
  },
  supervised_visitation_dispute: {
    primary: [["supervised visitation", 10], ["visitation center", 8], ["monitored visits", 9]],
    secondary: [["visit", 3], ["supervised", 5], ["contact", 3]],
    entities: ["parent", "child", "supervisor"],
    documents: ["visitation_order", "visitation_report"],
  },

  // ═══ ELDER & DISABILITY ═══
  elder_abuse: {
    primary: [["elder abuse", 10], ["abusing elderly", 10], ["hurting my parent", 9], ["nursing home abuse", 9]],
    secondary: [["old", 3], ["elderly", 5], ["senior", 5], ["aging", 3]],
    entities: ["elderly_person", "caregiver", "family_member"],
    documents: ["medical_record", "incident_report", "financial_record"],
    pre_lens: ["elder_is_being_exploited"],
  },
  eldercare: {
    primary: [["elder care", 9], ["senior care", 8], ["assisted living", 8], ["memory care", 8]],
    secondary: [["care facility", 5], ["caregiver", 5], ["aging parent", 6]],
    entities: ["elderly_person", "caregiver", "facility"],
    documents: ["care_plan", "medical_record", "billing_statement"],
  },
  nursing_home_abuse: {
    primary: [["nursing home", 9], ["neglect", 7], ["bedsores", 10], ["falls", 6], ["understaffed", 8], ["not being cared for", 9]],
    secondary: [["facility", 4], ["staff", 3], ["medication error", 7], ["weight loss", 6]],
    entities: ["resident", "nurse", "facility_administrator"],
    documents: ["care_plan", "incident_report", "medical_record", "inspection_report"],
  },
  disability_rights: {
    primary: [["disability", 7], ["ADA", 9], ["accommodation", 8], ["accessible", 7], ["disability discrimination", 10]],
    secondary: [["wheelchair", 6], ["ramp", 5], ["service animal", 6], ["reasonable accommodation", 8]],
    entities: ["disabled_person", "employer", "business"],
    documents: ["accommodation_request", "denial_letter", "medical_record"],
  },
  guardianship_abuse: {
    primary: [["guardian abuse", 10], ["conservator abuse", 10], ["guardian stealing", 10], ["exploiting ward", 10]],
    secondary: [["guardian", 6], ["conservator", 6], ["ward", 5], ["accounting", 4]],
    entities: ["guardian", "ward", "judge"],
    documents: ["guardianship_order", "financial_accounting", "bank_statement"],
    pre_lens: ["elder_is_being_exploited"],
  },
  long_term_care_neglect: {
    primary: [["long term care", 9], ["neglect", 7], ["not being cared for", 9], ["facility neglect", 9]],
    secondary: [["care", 2], ["facility", 3], ["staff", 2]],
    entities: ["resident", "facility", "caregiver"],
    documents: ["care_plan", "incident_report", "inspection_report"],
  },
  elder_financial_exploitation: {
    primary: [["financial exploitation", 10], ["stealing from elderly", 10], ["scamming seniors", 10], ["power of attorney abuse", 9]],
    secondary: [["money missing", 7], ["bank account", 4], ["wire transfer", 5], ["changed will", 7]],
    entities: ["elderly_person", "caregiver", "family_member", "financial_advisor"],
    documents: ["bank_statement", "power_of_attorney", "will", "financial_record"],
    pre_lens: ["elder_is_being_exploited"],
  },
  vulnerable_adult_protection: {
    primary: [["vulnerable adult", 10], ["adult protective services", 9], ["APS", 8], ["incapacitated adult", 9]],
    secondary: [["vulnerable", 4], ["protection", 3], ["adult", 2]],
    entities: ["vulnerable_adult", "caregiver", "case_worker"],
    documents: ["aps_report", "medical_record", "assessment"],
  },
  ada_accommodation_dispute: {
    primary: [["ADA", 9], ["accommodation denied", 10], ["disability accommodation", 10], ["reasonable accommodation", 9]],
    secondary: [["accommodation", 5], ["disability", 4], ["access", 3]],
    entities: ["disabled_person", "employer", "business", "landlord"],
    documents: ["accommodation_request", "denial_letter", "medical_documentation"],
  },
  home_health_agency_misconduct: {
    primary: [["home health", 9], ["home care", 8], ["home aide", 8], ["visiting nurse", 8]],
    secondary: [["aide", 4], ["home", 2], ["care", 2], ["visiting", 3]],
    entities: ["home_health_aide", "patient", "agency"],
    documents: ["care_plan", "billing_record", "incident_report"],
  },
  medicare_elder_fraud: {
    primary: [["medicare fraud", 10], ["billing fraud", 8], ["phantom billing", 10], ["upcoding", 9]],
    secondary: [["medicare", 5], ["billing", 3], ["charges", 3]],
    entities: ["provider", "patient", "medicare"],
    documents: ["medicare_statement", "billing_record", "eob"],
  },

  // ═══ TRIBAL & INDIGENOUS ═══
  tribal_law: {
    primary: [["tribal", 8], ["tribal law", 10], ["tribal court", 9], ["tribal nation", 8], ["Indian Country", 9]],
    secondary: [["reservation", 5], ["tribe", 6], ["native", 4], ["indigenous", 5]],
    entities: ["tribal_member", "tribal_court", "tribal_council"],
    documents: ["tribal_code", "court_order", "resolution"],
  },
  tribal_enrollment: {
    primary: [["tribal enrollment", 10], ["blood quantum", 10], ["disenrollment", 10], ["enrollment criteria", 9], ["Dawes Roll", 9]],
    secondary: [["enrollment", 5], ["member", 3], ["belong", 3], ["lineage", 6]],
    entities: ["tribal_member", "enrollment_office"],
    documents: ["enrollment_application", "census_roll", "birth_certificate"],
  },
  tribal_land_rights: {
    primary: [["tribal land", 10], ["allotment", 9], ["trust land", 9], ["BIA", 8], ["fractionated", 9], ["IIM account", 10]],
    secondary: [["land", 3], ["property", 3], ["lease", 3], ["trust", 4]],
    entities: ["allottee", "bia", "tribal_member"],
    documents: ["allotment_record", "title_status_report", "lease_agreement"],
  },
  tribal_housing: {
    primary: [["tribal housing", 10], ["NAHASDA", 10], ["HUD tribal", 9], ["tribal housing authority", 10]],
    secondary: [["housing", 3], ["reservation housing", 7], ["infrastructure", 4]],
    entities: ["tribal_member", "housing_authority"],
    documents: ["housing_application", "hud_correspondence", "inspection_report"],
  },
  treaty_rights: {
    primary: [["treaty", 9], ["treaty rights", 10], ["fishing rights", 9], ["hunting rights", 9], ["water rights", 8]],
    secondary: [["sovereign", 6], ["federal", 3], ["reserved rights", 7]],
    entities: ["tribal_nation", "federal_government"],
    documents: ["treaty_text", "court_opinion", "bia_correspondence"],
  },
  indigenous_sovereignty: {
    primary: [["sovereignty", 9], ["jurisdiction", 7], ["tribal sovereignty", 10], ["Indian Country jurisdiction", 10]],
    secondary: [["authority", 3], ["self-governance", 7], ["self-determination", 7]],
    entities: ["tribal_government", "state_government", "federal_government"],
    documents: ["tribal_constitution", "court_order", "jurisdictional_analysis"],
  },
  mmiw_cases: {
    primary: [["MMIW", 10], ["missing indigenous", 10], ["murdered indigenous", 10], ["missing native", 9], ["missing", 5], ["reservation", 6], ["tribal police", 8]],
    secondary: [["missing person", 6], ["disappeared", 5], ["unsolved", 5], ["cold case", 5], ["FBI", 5], ["BIA", 5], ["FOIA", 4], ["last seen", 5], ["sister", 3], ["daughter", 3]],
    entities: ["missing_person", "law_enforcement", "tribal_member", "FBI", "BIA"],
    documents: ["police_report", "foia_response", "medical_examiner_report"],
  },
  tribal_governance: {
    primary: [["tribal governance", 10], ["tribal council", 9], ["tribal election", 9], ["tribal constitution", 9]],
    secondary: [["governance", 4], ["council", 3], ["election", 3], ["constitution", 4]],
    entities: ["tribal_council", "tribal_member"],
    documents: ["tribal_constitution", "resolution", "election_record"],
  },
  tribal_state_jurisdiction_conflict: {
    primary: [["jurisdiction conflict", 9], ["tribal vs state", 10], ["PL 280", 10], ["McGirt", 9]],
    secondary: [["jurisdiction", 5], ["which court", 6], ["state vs tribal", 8]],
    entities: ["tribal_court", "state_court", "federal_court"],
    documents: ["court_order", "jurisdictional_brief"],
  },
  icwa_compliance: {
    primary: [["ICWA", 10], ["Indian Child Welfare", 10], ["active efforts", 9], ["tribal placement", 9]],
    secondary: [["native child", 7], ["tribal notice", 7], ["placement preference", 8]],
    entities: ["child", "parent", "tribe", "state_agency"],
    documents: ["icwa_notice", "court_order", "case_plan"],
  },

  // ═══ INSURANCE & MEDICAL ═══
  insurance_claim_denial: {
    primary: [["insurance denied", 10], ["claim denied", 10], ["insurance denial", 10], ["they said no", 7], ["denied my claim", 10]],
    secondary: [["insurance", 5], ["claim", 4], ["policy", 4], ["coverage", 4], ["deductible", 4]],
    entities: ["insurance_company", "adjuster", "policyholder"],
    documents: ["denial_letter", "policy", "claim_form", "correspondence"],
    pre_lens: ["insurance_denied_my_claim"],
  },
  health_insurance_denial: {
    primary: [["health insurance denied", 10], ["treatment denied", 9], ["coverage denied", 9], ["won't cover", 8]],
    secondary: [["health insurance", 6], ["copay", 4], ["out of network", 6], ["prior authorization", 7]],
    entities: ["insurance_company", "doctor", "hospital"],
    documents: ["denial_letter", "eob", "medical_record"],
    pre_lens: ["insurance_denied_my_claim"],
  },
  medical_malpractice: {
    primary: [["medical malpractice", 10], ["doctor error", 9], ["surgical error", 10], ["wrong diagnosis", 9], ["misdiagnosis", 10]],
    secondary: [["doctor", 4], ["hospital", 4], ["surgery", 4], ["treatment", 3], ["standard of care", 8]],
    entities: ["doctor", "hospital", "patient"],
    documents: ["medical_record", "billing_statement", "expert_opinion"],
    pre_lens: ["medical_harm"],
  },
  medicaid_denial: {
    primary: [["Medicaid denied", 10], ["Medicaid", 7], ["Medicaid eligibility", 9]],
    secondary: [["state insurance", 5], ["income limit", 5], ["coverage", 3]],
    entities: ["medicaid_agency", "applicant"],
    documents: ["denial_letter", "application", "income_documentation"],
  },
  medicare_denial: {
    primary: [["Medicare denied", 10], ["Medicare", 7], ["Medicare Part", 8]],
    secondary: [["Part A", 5], ["Part B", 5], ["Part D", 5], ["supplemental", 4]],
    entities: ["medicare", "provider", "beneficiary"],
    documents: ["denial_letter", "eob", "medical_record"],
  },
  hospital_billing_abuse: {
    primary: [["hospital bill", 8], ["overcharged", 9], ["billing fraud", 10], ["surprise bill", 9], ["balance billing", 9]],
    secondary: [["bill", 3], ["charges", 3], ["statement", 3], ["ER bill", 7]],
    entities: ["hospital", "patient", "billing_department"],
    documents: ["hospital_bill", "itemized_statement", "eob"],
  },
  medical_record_access: {
    primary: [["medical records", 7], ["won't give me records", 10], ["record access", 8], ["HIPAA", 8]],
    secondary: [["records", 3], ["access", 3], ["request", 3]],
    entities: ["provider", "patient"],
    documents: ["record_request", "correspondence"],
  },
  disability_claim_denial: {
    primary: [["disability denied", 10], ["SSDI denied", 10], ["SSI denied", 10], ["disability claim", 8]],
    secondary: [["disability", 5], ["can't work", 6], ["disabled", 5], ["Social Security", 6]],
    entities: ["ssa", "applicant", "doctor"],
    documents: ["denial_letter", "medical_record", "application"],
  },
  prior_authorization_abuse: {
    primary: [["prior authorization", 10], ["prior auth denied", 10], ["pre-authorization", 9]],
    secondary: [["authorization", 4], ["approval needed", 5], ["waiting for approval", 6]],
    entities: ["insurance_company", "doctor", "patient"],
    documents: ["prior_auth_request", "denial_letter", "medical_record"],
  },
  surprise_billing: {
    primary: [["surprise bill", 10], ["out of network", 8], ["balance bill", 9], ["No Surprises Act", 10]],
    secondary: [["unexpected bill", 7], ["didn't know", 4], ["emergency room", 5]],
    entities: ["provider", "insurance_company", "patient"],
    documents: ["bill", "eob", "insurance_card"],
  },
  pharmacy_benefit_manager_dispute: {
    primary: [["PBM", 9], ["pharmacy benefit", 10], ["formulary", 8], ["step therapy", 9]],
    secondary: [["pharmacy", 5], ["prescription", 4], ["medication", 4], ["copay", 4]],
    entities: ["pbm", "pharmacy", "insurance_company"],
    documents: ["formulary", "denial_letter", "prescription"],
  },
  medical_device_injury: {
    primary: [["medical device", 10], ["implant failure", 10], ["device recall", 9], ["defective device", 10]],
    secondary: [["implant", 6], ["device", 4], ["recall", 5], ["FDA", 5]],
    entities: ["manufacturer", "patient", "doctor"],
    documents: ["medical_record", "device_record", "fda_report"],
  },

  // ═══ HOUSING & PROPERTY ═══
  tenant_rights: {
    primary: [["tenant", 8], ["landlord", 8], ["lease", 7], ["rent", 6], ["tenant rights", 10]],
    secondary: [["apartment", 4], ["rental", 4], ["property manager", 5], ["maintenance", 4]],
    entities: ["landlord", "tenant", "property_manager"],
    documents: ["lease", "correspondence", "photos", "repair_request"],
    pre_lens: ["landlord_not_fixing_conditions"],
  },
  housing_discrimination: {
    primary: [["housing discrimination", 10], ["refused to rent", 9], ["fair housing", 9], ["discriminated", 7]],
    secondary: [["wouldn't rent", 7], ["turned down", 4], ["application denied", 5]],
    entities: ["landlord", "applicant", "housing_authority"],
    documents: ["application", "denial_letter", "correspondence"],
  },
  eviction_defense: {
    primary: [["eviction", 10], ["evicted", 9], ["eviction notice", 10], ["unlawful detainer", 9]],
    secondary: [["kicked out", 7], ["leave", 3], ["notice to quit", 8], ["30 day notice", 7]],
    entities: ["landlord", "tenant"],
    documents: ["eviction_notice", "lease", "court_filing"],
    pre_lens: ["being_evicted"],
  },
  section8_disputes: {
    primary: [["Section 8", 10], ["housing voucher", 10], ["PHA", 8], ["housing authority", 8]],
    secondary: [["voucher", 6], ["subsidy", 5], ["public housing", 7]],
    entities: ["housing_authority", "tenant", "landlord"],
    documents: ["voucher_document", "correspondence", "hearing_notice"],
  },
  hoa_disputes: {
    primary: [["HOA", 10], ["homeowners association", 10], ["CC&R", 9], ["condo association", 8]],
    secondary: [["association", 4], ["fine", 3], ["violation notice", 5], ["board", 3]],
    entities: ["hoa_board", "homeowner"],
    documents: ["bylaws", "ccr", "violation_notice", "meeting_minutes"],
  },
  landlord_harassment: {
    primary: [["landlord harassment", 10], ["landlord threatening", 9], ["illegal lockout", 10], ["shut off utilities", 10]],
    secondary: [["landlord", 5], ["harassing", 5], ["threatening", 4]],
    entities: ["landlord", "tenant"],
    documents: ["correspondence", "photos", "police_report"],
  },
  foreclosure_dispute: {
    primary: [["foreclosure", 10], ["mortgage default", 9], ["bank taking house", 9], ["foreclosure notice", 10]],
    secondary: [["mortgage", 5], ["behind on payments", 6], ["bank", 3], ["loan modification", 7]],
    entities: ["bank", "homeowner", "mortgage_servicer"],
    documents: ["mortgage", "foreclosure_notice", "payment_history"],
  },
  property_rights: {
    primary: [["property rights", 9], ["property dispute", 8], ["boundary dispute", 9], ["easement", 8], ["eminent domain", 10]],
    secondary: [["property", 3], ["land", 3], ["deed", 5], ["title", 4]],
    entities: ["property_owner", "neighbor", "government"],
    documents: ["deed", "survey", "title_report"],
  },
  mobile_home_park_dispute: {
    primary: [["mobile home", 9], ["trailer park", 8], ["manufactured housing", 9], ["lot rent", 8]],
    secondary: [["mobile", 3], ["trailer", 4], ["park", 2], ["lot", 2]],
    entities: ["park_owner", "resident"],
    documents: ["lease", "park_rules", "correspondence"],
  },
  short_term_rental_dispute: {
    primary: [["Airbnb", 9], ["short term rental", 10], ["VRBO", 8], ["vacation rental", 8]],
    secondary: [["rental", 3], ["booking", 4], ["host", 3], ["guest", 3]],
    entities: ["host", "guest", "platform"],
    documents: ["booking_confirmation", "correspondence", "photos"],
  },
  utility_shutoff_abuse: {
    primary: [["utility shutoff", 10], ["power shut off", 9], ["water shut off", 9], ["gas shut off", 9]],
    secondary: [["utility", 4], ["electric", 3], ["water", 2], ["gas", 2], ["bill", 2]],
    entities: ["utility_company", "customer"],
    documents: ["bill", "shutoff_notice", "correspondence"],
  },
  code_enforcement_retaliation: {
    primary: [["code enforcement", 9], ["building inspector", 8], ["code violation", 8], ["retaliatory inspection", 10]],
    secondary: [["inspector", 4], ["violation", 3], ["code", 3]],
    entities: ["inspector", "property_owner", "city"],
    documents: ["violation_notice", "inspection_report", "correspondence"],
  },

  // ═══ FINANCIAL & CONSUMER ═══
  debt_collection_abuse: {
    primary: [["debt collector", 10], ["collection calls", 9], ["FDCPA", 10], ["debt harassment", 10]],
    secondary: [["collector", 5], ["debt", 4], ["owe", 3], ["calling me", 4], ["threatening", 4]],
    entities: ["debt_collector", "creditor", "debtor"],
    documents: ["collection_letter", "phone_log", "credit_report"],
    pre_lens: ["debt_collector_harassment"],
  },
  predatory_lending: {
    primary: [["predatory lending", 10], ["payday loan", 10], ["high interest", 8], ["title loan", 9], ["loan shark", 10]],
    secondary: [["interest rate", 5], ["APR", 5], ["fees", 3], ["refinance", 4]],
    entities: ["lender", "borrower"],
    documents: ["loan_agreement", "payment_history", "tila_disclosure"],
  },
  bankruptcy_dispute: {
    primary: [["bankruptcy", 9], ["Chapter 7", 10], ["Chapter 13", 10], ["filing bankruptcy", 9]],
    secondary: [["debt", 4], ["creditor", 4], ["discharge", 6], ["trustee", 6]],
    entities: ["debtor", "creditor", "trustee"],
    documents: ["bankruptcy_petition", "financial_statement", "creditor_claim"],
  },
  tax_dispute: {
    primary: [["IRS", 9], ["tax dispute", 10], ["tax audit", 10], ["tax lien", 9], ["back taxes", 8]],
    secondary: [["taxes", 4], ["tax return", 5], ["assessment", 4], ["penalty", 4]],
    entities: ["irs", "taxpayer", "state_tax_agency"],
    documents: ["tax_return", "irs_notice", "assessment_letter"],
  },
  consumer_fraud: {
    primary: [["scam", 8], ["fraud", 7], ["ripped off", 9], ["deceptive", 8], ["false advertising", 9]],
    secondary: [["company", 3], ["product", 3], ["service", 2], ["refund", 4], ["warranty", 4]],
    entities: ["company", "consumer"],
    documents: ["contract", "receipt", "correspondence", "marketing_material"],
    pre_lens: ["scammed_or_defrauded"],
  },
  identity_theft: {
    primary: [["identity theft", 10], ["stolen identity", 10], ["someone opened accounts", 10], ["fraud alert", 8]],
    secondary: [["credit report", 5], ["unauthorized", 5], ["not my account", 7]],
    entities: ["victim", "identity_thief"],
    documents: ["credit_report", "fraud_report", "police_report"],
  },
  financial_exploitation: {
    primary: [["financial exploitation", 10], ["stealing money", 8], ["taking advantage financially", 9]],
    secondary: [["money", 3], ["account", 3], ["transfer", 3]],
    entities: ["victim", "exploiter"],
    documents: ["bank_statement", "financial_record"],
  },
  securities_fraud: {
    primary: [["securities fraud", 10], ["stock fraud", 10], ["investment fraud", 10], ["Ponzi scheme", 10], ["insider trading", 10]],
    secondary: [["investment", 5], ["stock", 4], ["broker", 5], ["portfolio", 4]],
    entities: ["broker", "investor", "company"],
    documents: ["account_statement", "trade_confirmation", "prospectus"],
  },
  crypto_fraud: {
    primary: [["crypto fraud", 10], ["cryptocurrency scam", 10], ["bitcoin scam", 10], ["NFT fraud", 9], ["rug pull", 10]],
    secondary: [["crypto", 6], ["bitcoin", 5], ["ethereum", 5], ["wallet", 4], ["exchange", 4]],
    entities: ["scammer", "victim", "exchange"],
    documents: ["transaction_record", "wallet_history", "correspondence"],
  },
  online_marketplace_fraud: {
    primary: [["online fraud", 9], ["marketplace scam", 10], ["eBay fraud", 9], ["Amazon fraud", 9]],
    secondary: [["online", 3], ["marketplace", 4], ["seller", 4], ["buyer", 3]],
    entities: ["seller", "buyer", "platform"],
    documents: ["order_confirmation", "correspondence", "payment_record"],
  },
  subscription_trap_billing: {
    primary: [["subscription trap", 10], ["can't cancel", 8], ["hidden charges", 9], ["recurring charge", 8], ["dark pattern", 9]],
    secondary: [["subscription", 5], ["cancel", 4], ["charge", 3], ["recurring", 5]],
    entities: ["company", "consumer"],
    documents: ["billing_statement", "correspondence", "terms_of_service"],
  },
  bank_account_closure: {
    primary: [["bank closed my account", 10], ["account frozen", 9], ["account closure", 9]],
    secondary: [["bank", 4], ["account", 3], ["frozen", 5], ["closed", 3]],
    entities: ["bank", "account_holder"],
    documents: ["closure_notice", "bank_statement", "correspondence"],
  },

  // ═══ EMPLOYMENT & LABOR ═══
  workplace_discrimination: {
    primary: [["workplace discrimination", 10], ["discriminated at work", 10], ["race discrimination", 10], ["gender discrimination", 10], ["age discrimination", 10]],
    secondary: [["treated differently", 6], ["passed over", 5], ["hostile work environment", 8], ["EEOC", 8]],
    entities: ["employer", "employee", "supervisor"],
    documents: ["employment_record", "email", "performance_review", "eeoc_complaint"],
  },
  wrongful_termination: {
    primary: [["wrongful termination", 10], ["fired illegally", 10], ["fired for no reason", 9], ["terminated unfairly", 9]],
    secondary: [["fired", 6], ["terminated", 5], ["let go", 4], ["laid off", 4]],
    entities: ["employer", "employee"],
    documents: ["termination_letter", "employment_record", "correspondence"],
    pre_lens: ["fired_or_retaliated_against"],
  },
  workers_compensation: {
    primary: [["workers comp", 10], ["workers compensation", 10], ["work injury", 9], ["injured on the job", 10], ["IME", 8]],
    secondary: [["injury", 4], ["workplace", 3], ["claim", 3], ["doctor", 3]],
    entities: ["employer", "employee", "insurance_company"],
    documents: ["incident_report", "medical_record", "claim_form", "ime_report"],
  },
  wage_theft: {
    primary: [["wage theft", 10], ["not paid", 8], ["unpaid wages", 10], ["overtime", 7], ["minimum wage", 8]],
    secondary: [["pay", 3], ["hours", 3], ["paycheck", 5], ["short", 3]],
    entities: ["employer", "employee"],
    documents: ["pay_stub", "time_record", "employment_agreement"],
    pre_lens: ["wage_theft"],
  },
  labor_violation: {
    primary: [["labor violation", 10], ["OSHA", 9], ["unsafe workplace", 9], ["labor law", 8]],
    secondary: [["safety", 4], ["violation", 3], ["workplace", 3], ["hazard", 5]],
    entities: ["employer", "employee", "osha"],
    documents: ["osha_complaint", "inspection_report", "incident_report"],
  },
  workplace_harassment: {
    primary: [["workplace harassment", 10], ["sexual harassment", 10], ["hostile work environment", 10], ["harassed at work", 10], ["harassing me at work", 10], ["supervisor harass", 9], ["boss harass", 9], ["coworker harass", 9]],
    secondary: [["harassed", 6], ["inappropriate", 5], ["uncomfortable", 4], ["HR", 4], ["work", 2], ["supervisor", 4], ["boss", 3]],
    entities: ["employer", "employee", "harasser", "supervisor", "boss", "coworker"],
    documents: ["complaint", "email", "hr_record"],
  },
  unemployment_benefits: {
    primary: [["unemployment", 8], ["unemployment benefits", 10], ["unemployment denied", 10]],
    secondary: [["benefits", 3], ["laid off", 5], ["job loss", 5]],
    entities: ["employer", "employee", "unemployment_agency"],
    documents: ["denial_letter", "employment_record", "correspondence"],
  },
  gig_worker_misclassification: {
    primary: [["gig worker", 9], ["independent contractor", 8], ["misclassified", 10], ["1099", 8]],
    secondary: [["Uber", 5], ["Lyft", 5], ["DoorDash", 5], ["freelance", 4], ["contractor", 4]],
    entities: ["company", "worker"],
    documents: ["contract", "1099", "pay_record"],
  },
  non_compete_dispute: {
    primary: [["non-compete", 10], ["non compete", 10], ["restrictive covenant", 9], ["can't work for competitor", 9]],
    secondary: [["compete", 4], ["restriction", 4], ["former employer", 5]],
    entities: ["employer", "employee"],
    documents: ["non_compete_agreement", "employment_contract"],
  },
  wage_garnishment_error: {
    primary: [["wage garnishment", 10], ["garnishment error", 10], ["paycheck garnished", 9]],
    secondary: [["garnishment", 6], ["paycheck", 3], ["deduction", 4]],
    entities: ["employer", "creditor", "employee"],
    documents: ["garnishment_order", "pay_stub", "court_order"],
  },
  workplace_surveillance: {
    primary: [["workplace surveillance", 10], ["monitoring employees", 9], ["spying on workers", 10], ["tracking employees", 9]],
    secondary: [["camera", 4], ["monitoring", 5], ["GPS tracking", 7], ["email monitoring", 7]],
    entities: ["employer", "employee"],
    documents: ["policy", "correspondence", "monitoring_record"],
  },

  // ═══ BENEFITS & PUBLIC ASSISTANCE ═══
  benefits_denial: {
    primary: [["benefits denied", 10], ["denied benefits", 10], ["benefit denial", 10]],
    secondary: [["benefits", 4], ["denied", 4], ["application", 3], ["appeal", 4]],
    entities: ["agency", "applicant"],
    documents: ["denial_letter", "application", "appeal"],
  },
  snap_denial: {
    primary: [["SNAP denied", 10], ["food stamps denied", 10], ["SNAP", 8], ["food stamps", 8], ["WIC", 7], ["EBT", 7]],
    secondary: [["food assistance", 6], ["food", 2], ["hungry", 5]],
    entities: ["dss", "applicant"],
    documents: ["denial_letter", "application", "income_documentation"],
  },
  veterans_benefits: {
    primary: [["VA benefits", 10], ["veterans benefits", 10], ["VA denied", 10], ["disability rating", 8], ["service connected", 9]],
    secondary: [["veteran", 6], ["military", 5], ["served", 4], ["DD-214", 8]],
    entities: ["veteran", "va"],
    documents: ["dd214", "va_decision", "medical_record", "buddy_statement"],
  },
  social_security_disability: {
    primary: [["Social Security disability", 10], ["SSDI", 10], ["SSI", 9], ["disability benefits", 8]],
    secondary: [["Social Security", 6], ["disability", 5], ["can't work", 5]],
    entities: ["ssa", "applicant", "doctor"],
    documents: ["denial_letter", "medical_record", "application"],
  },
  public_assistance_dispute: {
    primary: [["public assistance", 9], ["welfare", 7], ["TANF", 9], ["cash assistance", 8]],
    secondary: [["assistance", 3], ["benefits", 3], ["help", 2]],
    entities: ["agency", "applicant"],
    documents: ["denial_letter", "application", "correspondence"],
  },
  voucher_termination: {
    primary: [["voucher terminated", 10], ["lost my voucher", 10], ["housing voucher", 8]],
    secondary: [["voucher", 5], ["housing", 3], ["terminated", 4]],
    entities: ["housing_authority", "tenant"],
    documents: ["termination_notice", "hearing_notice", "correspondence"],
  },
  medicaid_ltc_eligibility: {
    primary: [["Medicaid long term care", 10], ["nursing home Medicaid", 10], ["Medicaid eligibility", 9], ["spend down", 8]],
    secondary: [["Medicaid", 5], ["long term care", 6], ["nursing home", 5], ["eligibility", 4]],
    entities: ["medicaid_agency", "applicant"],
    documents: ["application", "financial_record", "denial_letter"],
  },
  benefits_overpayment_recoupment: {
    primary: [["overpayment", 9], ["recoupment", 9], ["pay back benefits", 10], ["benefits overpayment", 10]],
    secondary: [["owe", 3], ["pay back", 5], ["too much", 4]],
    entities: ["agency", "recipient"],
    documents: ["overpayment_notice", "correspondence"],
  },

  // ═══ MARKET & CORPORATE ═══
  market_concentration: {
    primary: [["market concentration", 10], ["monopoly", 9], ["antitrust", 8], ["consolidation", 8]],
    secondary: [["market", 3], ["competition", 4], ["dominant", 4]],
    entities: ["corporation", "regulator"],
    documents: ["market_report", "sec_filing", "merger_document"],
  },
  antitrust_violation: {
    primary: [["antitrust", 10], ["price fixing", 10], ["collusion", 10], ["Sherman Act", 10]],
    secondary: [["competition", 4], ["cartel", 7], ["bid rigging", 9]],
    entities: ["corporation", "competitor"],
    documents: ["sec_filing", "correspondence", "pricing_data"],
  },
  corporate_capture: {
    primary: [["corporate capture", 10], ["revolving door", 9], ["industry influence", 8], ["regulatory capture", 9]],
    secondary: [["lobby", 5], ["influence", 4], ["industry", 3]],
    entities: ["corporation", "regulator", "lobbyist"],
    documents: ["lobbying_disclosure", "campaign_finance", "correspondence"],
  },
  supply_chain_exploitation: {
    primary: [["supply chain", 8], ["exploitation", 7], ["forced labor", 10], ["sweatshop", 10]],
    secondary: [["supplier", 4], ["factory", 4], ["workers", 3]],
    entities: ["corporation", "supplier", "worker"],
    documents: ["audit_report", "supply_chain_record", "correspondence"],
  },
  agriculture_exploitation: {
    primary: [["agriculture", 7], ["farm", 6], ["farmer", 7], ["seed monopoly", 10], ["Monsanto", 9], ["Bayer", 7]],
    secondary: [["crop", 4], ["harvest", 3], ["ranch", 4], ["livestock", 4], ["subsidy", 5]],
    entities: ["farmer", "corporation", "usda"],
    documents: ["farm_record", "contract", "subsidy_record"],
  },
  nonprofit_compliance: {
    primary: [["nonprofit", 8], ["Form 990", 10], ["charity fraud", 10], ["misuse of funds", 9]],
    secondary: [["charity", 5], ["donation", 4], ["board", 3], ["mission", 3]],
    entities: ["nonprofit", "board_member", "donor"],
    documents: ["form_990", "financial_statement", "bylaws"],
  },
  public_contract_abuse: {
    primary: [["public contract", 9], ["government contract", 9], ["bid rigging", 10], ["no-bid contract", 10]],
    secondary: [["contract", 3], ["procurement", 5], ["bid", 4]],
    entities: ["contractor", "government_agency"],
    documents: ["contract", "bid_document", "correspondence"],
  },
  regulatory_capture: {
    primary: [["regulatory capture", 10], ["regulator", 7], ["industry influence", 8]],
    secondary: [["regulation", 4], ["agency", 3], ["rule", 2]],
    entities: ["regulator", "corporation"],
    documents: ["regulation", "correspondence", "lobbying_record"],
  },
  corporate_tax_avoidance: {
    primary: [["tax avoidance", 10], ["tax haven", 10], ["offshore", 8], ["transfer pricing", 9]],
    secondary: [["corporate tax", 6], ["loophole", 6], ["shell company", 8]],
    entities: ["corporation", "tax_authority"],
    documents: ["tax_filing", "financial_statement", "corporate_record"],
  },
  public_utility_monopoly_abuse: {
    primary: [["utility monopoly", 10], ["utility abuse", 9], ["rate hike", 8], ["utility company", 7]],
    secondary: [["utility", 4], ["electric company", 5], ["water company", 5], ["rate", 3]],
    entities: ["utility_company", "customer", "regulator"],
    documents: ["bill", "rate_schedule", "regulatory_filing"],
  },
  algorithmic_discrimination: {
    primary: [["algorithm", 8], ["algorithmic discrimination", 10], ["AI bias", 10], ["automated decision", 9]],
    secondary: [["algorithm", 5], ["automated", 4], ["AI", 4], ["machine learning", 5]],
    entities: ["company", "affected_person"],
    documents: ["decision_record", "correspondence"],
  },

  // ═══ ENVIRONMENTAL & PUBLIC HEALTH ═══
  environmental_violation: {
    primary: [["environmental violation", 10], ["pollution", 8], ["EPA", 8], ["contamination", 8]],
    secondary: [["environment", 4], ["clean", 2], ["waste", 4], ["dumping", 6]],
    entities: ["company", "epa", "community"],
    documents: ["epa_record", "test_result", "correspondence"],
  },
  water_contamination: {
    primary: [["water contamination", 10], ["contaminated water", 10], ["lead in water", 10], ["PFAS", 9], ["Flint", 8]],
    secondary: [["water", 3], ["drinking water", 6], ["well", 4], ["tap water", 5]],
    entities: ["water_utility", "community", "epa"],
    documents: ["water_test", "epa_report", "health_record"],
  },
  public_health_risk: {
    primary: [["public health", 8], ["health risk", 8], ["outbreak", 8], ["exposure", 6]],
    secondary: [["health", 2], ["sick", 3], ["community", 3]],
    entities: ["health_department", "community"],
    documents: ["health_report", "test_result", "correspondence"],
  },
  community_harm: {
    primary: [["community harm", 9], ["neighborhood", 5], ["environmental racism", 10], ["environmental justice", 10]],
    secondary: [["community", 3], ["neighborhood", 3], ["residents", 3]],
    entities: ["community", "corporation", "government"],
    documents: ["community_survey", "health_data", "correspondence"],
  },
  land_use_dispute: {
    primary: [["land use", 9], ["zoning", 8], ["rezoning", 9], ["development", 5], ["eminent domain", 10]],
    secondary: [["land", 3], ["property", 3], ["building", 3], ["permit", 4]],
    entities: ["developer", "community", "government"],
    documents: ["zoning_record", "permit", "correspondence"],
  },
  air_quality_violation: {
    primary: [["air quality", 10], ["air pollution", 10], ["emissions", 8], ["smog", 7]],
    secondary: [["air", 2], ["breathe", 4], ["smell", 4], ["fumes", 6]],
    entities: ["factory", "epa", "community"],
    documents: ["air_quality_report", "epa_record", "health_record"],
  },
  industrial_noise_nuisance: {
    primary: [["noise", 6], ["industrial noise", 10], ["noise pollution", 10], ["noise nuisance", 10]],
    secondary: [["loud", 4], ["decibel", 6], ["vibration", 5]],
    entities: ["factory", "community", "government"],
    documents: ["noise_measurement", "complaint", "correspondence"],
  },
  toxic_exposure: {
    primary: [["toxic exposure", 10], ["chemical exposure", 10], ["asbestos", 10], ["toxic waste", 10]],
    secondary: [["toxic", 6], ["chemical", 4], ["exposure", 4], ["cancer", 5]],
    entities: ["employer", "company", "worker"],
    documents: ["medical_record", "exposure_record", "safety_data_sheet"],
  },
  wildfire_liability: {
    primary: [["wildfire", 10], ["fire liability", 9], ["utility fire", 9], ["PG&E", 8]],
    secondary: [["fire", 4], ["burned", 5], ["property damage", 4]],
    entities: ["utility_company", "property_owner"],
    documents: ["insurance_claim", "fire_report", "property_assessment"],
  },

  // ═══ IMMIGRATION ═══
  immigration_case: {
    primary: [["immigration", 8], ["visa", 7], ["green card", 8], ["deportation", 9], ["USCIS", 9]],
    secondary: [["status", 3], ["petition", 4], ["immigration court", 7]],
    entities: ["immigrant", "uscis", "ice"],
    documents: ["visa_application", "uscis_notice", "court_notice"],
  },
  asylum_claim: {
    primary: [["asylum", 10], ["refugee", 8], ["persecution", 9], ["fled my country", 10], ["credible fear", 10]],
    secondary: [["country", 3], ["fled", 5], ["danger", 4], ["political", 3]],
    entities: ["asylum_seeker", "immigration_judge"],
    documents: ["asylum_application", "country_condition_evidence", "court_notice"],
  },
  detention_abuse: {
    primary: [["detention", 8], ["ICE detention", 10], ["detained", 7], ["immigration jail", 9]],
    secondary: [["locked up", 5], ["facility", 3], ["detained", 5]],
    entities: ["detainee", "ice", "detention_facility"],
    documents: ["detention_record", "medical_record", "complaint"],
  },
  immigration_benefits: {
    primary: [["immigration benefits", 9], ["work permit", 8], ["EAD", 9], ["TPS", 9], ["DACA", 10]],
    secondary: [["work authorization", 7], ["permit", 3], ["status", 3]],
    entities: ["immigrant", "uscis"],
    documents: ["application", "uscis_notice", "correspondence"],
  },
  family_separation_case: {
    primary: [["family separation", 10], ["separated from family", 10], ["children taken at border", 10]],
    secondary: [["separated", 5], ["border", 5], ["family", 3]],
    entities: ["parent", "child", "ice", "cbp"],
    documents: ["separation_record", "court_order", "correspondence"],
  },
  work_authorization_dispute: {
    primary: [["work authorization", 10], ["can't work legally", 9], ["EAD denied", 10]],
    secondary: [["work permit", 6], ["employment", 3], ["authorization", 4]],
    entities: ["immigrant", "uscis", "employer"],
    documents: ["ead_application", "denial_notice", "correspondence"],
  },
  consular_processing_failure: {
    primary: [["consular processing", 10], ["embassy", 8], ["consulate", 8], ["visa interview", 9]],
    secondary: [["consulate", 5], ["embassy", 5], ["interview", 3]],
    entities: ["applicant", "consulate"],
    documents: ["visa_application", "interview_notice", "correspondence"],
  },

  // ═══ PUBLIC SAFETY & EMERGENCY ═══
  emergency_safety: {
    primary: [["emergency", 7], ["danger", 7], ["unsafe", 6], ["need help now", 9]],
    secondary: [["help", 2], ["urgent", 4], ["immediate", 4]],
    entities: ["victim", "perpetrator"],
    documents: [],
    pre_lens: ["someone_is_threatening_me"],
  },
  immediate_threat: {
    primary: [["threat", 7], ["threatening me", 9], ["going to hurt me", 10], ["stalking", 9]],
    secondary: [["scared", 5], ["afraid", 5], ["following me", 7]],
    entities: ["victim", "perpetrator"],
    documents: ["police_report", "text_messages"],
    pre_lens: ["someone_is_threatening_me", "i_am_being_stalked"],
  },
  domestic_violence_emergency: {
    primary: [["domestic violence", 9], ["partner violence", 10], ["hitting me", 10], ["abuse", 7]],
    secondary: [["partner", 4], ["spouse", 4], ["hurt", 3]],
    entities: ["victim", "abuser"],
    documents: ["police_report", "medical_record", "protective_order"],
    pre_lens: ["someone_is_threatening_me", "my_partner_is_controlling_me"],
  },
  missing_person: {
    primary: [["missing person", 10], ["disappeared", 8], ["can't find", 6], ["missing", 5]],
    secondary: [["gone", 3], ["last seen", 6], ["search", 3]],
    entities: ["missing_person", "family_member", "law_enforcement"],
    documents: ["police_report", "photos", "correspondence"],
  },
  human_trafficking: {
    primary: [["trafficking", 10], ["human trafficking", 10], ["forced labor", 10], ["sex trafficking", 10]],
    secondary: [["forced", 5], ["trapped", 6], ["can't leave", 7], ["controlled", 5]],
    entities: ["victim", "trafficker"],
    documents: [],
    pre_lens: ["someone_is_threatening_me"],
  },
  child_endangerment: {
    primary: [["child endangerment", 10], ["child in danger", 10], ["child at risk", 9]],
    secondary: [["child", 3], ["kid", 3], ["danger", 4], ["risk", 3]],
    entities: ["child", "parent", "caregiver"],
    documents: ["police_report", "medical_record", "school_record"],
    pre_lens: ["child_is_being_hurt"],
  },
  public_health_emergency: {
    primary: [["public health emergency", 10], ["outbreak", 8], ["pandemic", 7], ["quarantine", 7]],
    secondary: [["health", 2], ["emergency", 4], ["sick", 3]],
    entities: ["health_department", "community"],
    documents: ["health_order", "test_result"],
  },
  environmental_hazard: {
    primary: [["environmental hazard", 10], ["chemical spill", 10], ["gas leak", 9], ["toxic release", 10]],
    secondary: [["hazard", 5], ["spill", 5], ["leak", 4], ["toxic", 5]],
    entities: ["company", "community", "epa"],
    documents: ["incident_report", "test_result"],
  },
  disaster_relief_denial: {
    primary: [["FEMA denied", 10], ["disaster relief", 9], ["hurricane", 7], ["flood", 6], ["tornado", 7]],
    secondary: [["disaster", 5], ["relief", 3], ["FEMA", 7], ["SBA loan", 6]],
    entities: ["fema", "applicant"],
    documents: ["fema_application", "denial_letter", "damage_assessment"],
  },
  emergency_shelter_access: {
    primary: [["shelter", 7], ["emergency shelter", 10], ["homeless", 7], ["no place to go", 8]],
    secondary: [["shelter", 5], ["housing", 3], ["sleep", 3]],
    entities: ["shelter", "person"],
    documents: [],
  },
  missing_vulnerable_adult: {
    primary: [["missing vulnerable adult", 10], ["missing elderly", 10], ["wandered off", 8], ["dementia missing", 10]],
    secondary: [["missing", 5], ["vulnerable", 4], ["adult", 2]],
    entities: ["missing_person", "caregiver", "law_enforcement"],
    documents: ["police_report", "medical_record"],
  },

  // ═══ GENERAL ═══
  general_investigation: {
    primary: [["investigation", 5], ["research", 4], ["looking into", 4]],
    secondary: [["general", 2], ["help", 1], ["situation", 1]],
    entities: [],
    documents: [],
  },
  personal_case: {
    primary: [["personal", 4], ["my case", 5], ["my situation", 5]],
    secondary: [["help", 1], ["need", 1]],
    entities: [],
    documents: [],
  },
  community_case: {
    primary: [["community", 5], ["neighborhood", 4], ["our town", 5], ["community issue", 7]],
    secondary: [["community", 3], ["neighbors", 3]],
    entities: ["community"],
    documents: [],
  },
  cross_border_jurisdiction_dispute: {
    primary: [["cross border", 9], ["multi-state", 9], ["international", 6], ["jurisdiction", 7]],
    secondary: [["border", 3], ["state line", 5], ["different state", 5]],
    entities: [],
    documents: ["court_filing"],
  },
  multi_party_community_action: {
    primary: [["class action", 8], ["multi-party", 9], ["group lawsuit", 9], ["collective action", 8]],
    secondary: [["group", 3], ["many people", 4], ["all of us", 5]],
    entities: [],
    documents: ["complaint", "court_filing"],
  },
  other: {
    primary: [["other", 2], ["not sure", 3], ["don't know", 3]],
    secondary: [["help", 1], ["something", 1]],
    entities: [],
    documents: [],
  },

  // ═══ LGBTQ+ RIGHTS ═══
  lgbtq_discrimination: {
    primary: [["LGBTQ", 8], ["gay discrimination", 10], ["transgender discrimination", 10], ["sexual orientation", 8], ["gender identity", 8]],
    secondary: [["queer", 5], ["bisexual", 5], ["lesbian", 5], ["gay", 5], ["trans", 5]],
    entities: ["lgbtq_person", "employer", "business"],
    documents: ["complaint", "correspondence", "employment_record"],
  },
  conversion_therapy_harm: {
    primary: [["conversion therapy", 10], ["reparative therapy", 10], ["pray the gay away", 10]],
    secondary: [["therapy", 3], ["change orientation", 7], ["cure", 4]],
    entities: ["therapist", "survivor"],
    documents: ["therapy_record", "medical_record"],
  },
  gender_marker_change: {
    primary: [["gender marker", 10], ["name change", 7], ["gender change", 9], ["identity documents", 8]],
    secondary: [["birth certificate", 5], ["driver's license", 4], ["passport", 4], ["legal name", 5]],
    entities: ["applicant", "court", "agency"],
    documents: ["court_order", "application", "identity_document"],
  },
  lgbtq_healthcare_denial: {
    primary: [["gender affirming care", 10], ["hormone therapy denied", 10], ["transition care denied", 10]],
    secondary: [["transgender healthcare", 8], ["HRT", 7], ["gender dysphoria", 7]],
    entities: ["insurance_company", "provider", "patient"],
    documents: ["denial_letter", "medical_record", "policy"],
  },
  lgbtq_family_recognition: {
    primary: [["same-sex marriage", 10], ["LGBTQ adoption", 10], ["same-sex parent", 9], ["marriage recognition", 8]],
    secondary: [["marriage", 4], ["adoption", 4], ["parent", 3], ["family", 3]],
    entities: ["parent", "child", "court"],
    documents: ["marriage_certificate", "adoption_record", "court_order"],
  },
  lgbtq_housing_discrimination: {
    primary: [["LGBTQ housing", 10], ["refused to rent to us", 9], ["housing discrimination gay", 10]],
    secondary: [["housing", 3], ["rent", 3], ["apartment", 3]],
    entities: ["landlord", "tenant"],
    documents: ["application", "correspondence", "denial_letter"],
  },
  lgbtq_workplace_harassment: {
    primary: [["LGBTQ workplace", 10], ["harassed for being gay", 10], ["harassed for being trans", 10]],
    secondary: [["workplace", 3], ["coworker", 4], ["boss", 3]],
    entities: ["employer", "employee", "harasser"],
    documents: ["complaint", "email", "hr_record"],
  },
  lgbtq_youth_protection: {
    primary: [["LGBTQ youth", 10], ["gay teen", 9], ["trans youth", 10], ["bullied for being gay", 10]],
    secondary: [["youth", 4], ["teen", 4], ["school", 3], ["bullied", 5]],
    entities: ["minor", "school", "parent"],
    documents: ["school_record", "incident_report", "correspondence"],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════════

let profileCache: Map<string, PipelineSignalProfile> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build signal profiles for all pipelines.
 * Merges the SIGNAL_MAP with pipeline metadata from pipeline_types.json.
 */
export function buildSignalProfiles(configDir?: string): Map<string, PipelineSignalProfile> {
  if (profileCache) return profileCache;

  const dir = configDir || join(import.meta.dirname, "config");
  const typesRaw = readFileSync(join(dir, "pipeline_types.json"), "utf-8");
  const typesConfig = JSON.parse(typesRaw);

  const profiles = new Map<string, PipelineSignalProfile>();

  for (const [catId, catData] of Object.entries(typesConfig.categories) as [string, any][]) {
    for (const pipeline of catData.pipelines) {
      const signals = SIGNAL_MAP[pipeline.id];
      if (!signals) {
        // Pipeline exists in registry but has no signal profile — create a minimal one
        // from the pipeline's label and description
        const words = (pipeline.label + " " + pipeline.description)
          .toLowerCase()
          .split(/\s+/)
          .filter((w: string) => w.length > 3);
        const uniqueWords = [...new Set(words)].slice(0, 10);

        profiles.set(pipeline.id, {
          pipeline_id: pipeline.id,
          category: catId,
          label: pipeline.label,
          primary_signals: uniqueWords.slice(0, 5).map(w => ({ term: w, weight: 3 })),
          secondary_signals: uniqueWords.slice(5).map(w => ({ term: w, weight: 1 })),
          entity_signals: [],
          document_signals: [],
        });
        continue;
      }

      profiles.set(pipeline.id, {
        pipeline_id: pipeline.id,
        category: catId,
        label: pipeline.label,
        primary_signals: signals.primary.map(([term, weight]) => ({ term, weight })),
        secondary_signals: signals.secondary.map(([term, weight]) => ({ term, weight })),
        entity_signals: signals.entities,
        document_signals: signals.documents,
        pre_lens_situations: signals.pre_lens,
      });
    }
  }

  profileCache = profiles;
  return profiles;
}

/**
 * Clear the profile cache (for testing).
 */
export function clearSignalProfileCache(): void {
  profileCache = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize text for matching: lowercase, collapse whitespace, remove punctuation.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a term appears in the text (word-boundary aware for short terms).
 */
function termMatches(normalizedText: string, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (normalizedTerm.length <= 3) {
    // For very short terms, require word boundary
    const regex = new RegExp(`\\b${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

/**
 * Score a single pipeline against user input text.
 */
export function scorePipeline(
  profile: PipelineSignalProfile,
  normalizedText: string
): { score: number; matchedSignals: string[] } {
  let score = 0;
  const matchedSignals: string[] = [];

  // Score primary signals
  for (const signal of profile.primary_signals) {
    if (termMatches(normalizedText, signal.term)) {
      const points = signal.negative ? -signal.weight : signal.weight;
      score += points;
      matchedSignals.push(`primary:${signal.term}(${points})`);
    }
  }

  // Score secondary signals
  for (const signal of profile.secondary_signals) {
    if (termMatches(normalizedText, signal.term)) {
      const points = signal.negative ? -signal.weight : signal.weight;
      score += points;
      matchedSignals.push(`secondary:${signal.term}(${points})`);
    }
  }

  // Score entity signals (lower weight, additive)
  for (const entity of profile.entity_signals) {
    const entityTerms = entity.replace(/_/g, " ");
    if (termMatches(normalizedText, entityTerms)) {
      score += 2;
      matchedSignals.push(`entity:${entity}(2)`);
    }
  }

  // Score document signals (lower weight, additive)
  for (const doc of profile.document_signals) {
    const docTerms = doc.replace(/_/g, " ");
    if (termMatches(normalizedText, docTerms)) {
      score += 2;
      matchedSignals.push(`document:${doc}(2)`);
    }
  }

  return { score, matchedSignals };
}

/**
 * Run auto-detection against all pipelines.
 * Returns ranked suggestions with confidence scores.
 */
export function autoDetect(
  answers: IntakeAnswers,
  configDir?: string,
  maxSuggestions: number = 5
): AutoDetectResult {
  const profiles = buildSignalProfiles(configDir);

  // Combine all answer text
  const combinedText = [
    answers.what_happened,
    answers.who_involved,
    answers.documents_available,
    answers.where,
    answers.additional_context,
    answers.combined_text,
  ]
    .filter(Boolean)
    .join(" ");

  if (!combinedText.trim()) {
    return {
      suggestions: [],
      category_affinity: [],
      suggested_pre_lenses: [],
      next_questions: INTAKE_QUESTIONS.filter(q => q.always),
      ready_to_recommend: false,
    };
  }

  const normalizedText = normalizeText(combinedText);

  // Score all pipelines
  const scored: { profile: PipelineSignalProfile; score: number; matchedSignals: string[] }[] = [];

  for (const [, profile] of profiles) {
    const { score, matchedSignals } = scorePipeline(profile, normalizedText);
    if (score > 0) {
      scored.push({ profile, score, matchedSignals });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Compute confidence using absolute scoring thresholds
  // A score of 20+ = high confidence, 10-20 = medium, <10 = low
  // Also use relative scoring for ranking within the result set
  const ABSOLUTE_HIGH = 20;
  const ABSOLUTE_MEDIUM = 10;
  const maxScore = scored.length > 0 ? scored[0].score : 1;

  // Build suggestions
  const suggestions: PipelineSuggestion[] = scored.slice(0, maxSuggestions).map(({ profile, score, matchedSignals }) => {
    // Blend absolute and relative confidence
    const absoluteConfidence = Math.min(score / ABSOLUTE_HIGH, 1.0);
    const relativeConfidence = Math.min(score / Math.max(maxScore, 1), 1.0);
    const confidence = Math.round(((absoluteConfidence * 0.6) + (relativeConfidence * 0.4)) * 100) / 100;
    const confidenceLabel: "high" | "medium" | "low" =
      (score >= ABSOLUTE_HIGH && confidence >= 0.7) ? "high" :
      (score >= ABSOLUTE_MEDIUM || confidence >= 0.4) ? "medium" : "low";

    // Build human-readable match reasons
    const reasons: string[] = [];
    const primaryMatches = matchedSignals.filter(s => s.startsWith("primary:"));
    const secondaryMatches = matchedSignals.filter(s => s.startsWith("secondary:"));

    if (primaryMatches.length > 0) {
      const terms = primaryMatches.map(s => s.replace(/^primary:/, "").replace(/\(\d+\)$/, "")).slice(0, 3);
      reasons.push(`Strong match on: ${terms.join(", ")}`);
    }
    if (secondaryMatches.length > 0) {
      reasons.push(`${secondaryMatches.length} supporting signal${secondaryMatches.length > 1 ? "s" : ""}`);
    }

    return {
      pipeline_id: profile.pipeline_id,
      category: profile.category,
      label: profile.label,
      confidence: Math.round(confidence * 100) / 100,
      confidence_label: confidenceLabel,
      match_reasons: reasons,
      matched_signals: matchedSignals,
    };
  });

  // Compute category affinity
  const categoryScores = new Map<string, number>();
  for (const { profile, score } of scored) {
    const current = categoryScores.get(profile.category) || 0;
    categoryScores.set(profile.category, current + score);
  }
  const categoryAffinity = Array.from(categoryScores.entries())
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score);

  // Collect suggested pre-lenses from top matches
  const preLenses = new Set<string>();
  for (const { profile } of scored.slice(0, 3)) {
    if (profile.pre_lens_situations) {
      for (const pl of profile.pre_lens_situations) {
        preLenses.add(pl);
      }
    }
  }

  // Determine which questions to ask next
  const topCategory = categoryAffinity.length > 0 ? categoryAffinity[0].category : null;
  const answeredQuestions = new Set<string>();
  if (answers.what_happened) answeredQuestions.add("what_happened");
  if (answers.who_involved) answeredQuestions.add("who_involved");
  if (answers.documents_available) answeredQuestions.add("documents_available");
  if (answers.where) answeredQuestions.add("where");
  if (answers.additional_context) answeredQuestions.add("additional_context");

  const nextQuestions = INTAKE_QUESTIONS
    .filter(q => !answeredQuestions.has(q.id))
    .filter(q => {
      if (q.always) return true;
      if (q.follow_up_for && topCategory) {
        return q.follow_up_for.includes(topCategory);
      }
      // Ask document and additional context questions if we have at least 2 answers
      return answeredQuestions.size >= 2;
    })
    .sort((a, b) => a.order - b.order);

  // Ready to recommend if:
  // 1. Top suggestion has high confidence (absolute score >= 20), OR
  // 2. We have at least 2 answers and a medium+ confidence match (absolute score >= 10)
  const topAbsoluteScore = scored.length > 0 ? scored[0].score : 0;
  const readyToRecommend =
    (suggestions.length > 0 && topAbsoluteScore >= ABSOLUTE_HIGH) ||
    (suggestions.length > 0 && topAbsoluteScore >= ABSOLUTE_MEDIUM && answeredQuestions.size >= 2);

  return {
    suggestions,
    category_affinity: categoryAffinity,
    suggested_pre_lenses: Array.from(preLenses),
    next_questions: nextQuestions,
    ready_to_recommend: readyToRecommend,
  };
}

/**
 * Get the total number of signal profiles (for testing).
 */
export function getSignalProfileCount(configDir?: string): number {
  const profiles = buildSignalProfiles(configDir);
  return profiles.size;
}

/**
 * Get a specific signal profile (for testing/debugging).
 */
export function getSignalProfile(pipelineId: string, configDir?: string): PipelineSignalProfile | undefined {
  const profiles = buildSignalProfiles(configDir);
  return profiles.get(pipelineId);
}
