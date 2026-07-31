/**
 * Engine 5: Problem Interpreter / Front Door
 * 
 * Deterministic keyword-based intake system.
 * User tells their story → system detects claim types → asks clarifying questions
 * → generates evidence guidance → produces case summary.
 * 
 * Flow:
 * 1. "Tell me what happened" → raw story input
 * 2. Keyword matching parses story → detects jurisdiction + claim candidates
 * 3. Clarifying questions refine the claim
 * 4. Evidence guidance tells user what to gather
 * 5. Output: claim summary, evidence needs, next steps
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

// Known claim types the system can detect
const CLAIM_TYPES = [
  "housing_discrimination", "employment_discrimination", "consumer_fraud",
  "insurance_bad_faith", "medical_malpractice", "police_misconduct",
  "wage_theft", "landlord_tenant", "debt_collection_abuse",
  "predatory_lending", "environmental_harm", "product_liability",
  "civil_rights_violation", "family_law", "immigration",
  "workers_compensation", "social_security_disability", "veterans_benefits",
  "education_rights", "elder_abuse", "disability_discrimination",
  "retaliation", "whistleblower", "government_benefits",
  "disability_benefits", "medicaid", "snap", "veterans", "unemployment",
  "nursing_home", "guardianship", "child_welfare",
] as const;

export interface IntakeSession {
  id: number;
  rawStory: string;
  jurisdictionGuess: string | null;
  claimCandidates: ClaimCandidate[];
  selectedClaim: string | null;
  confidenceScore: number;
  status: string;
  createdAt: number;
}

export interface ClaimCandidate {
  claimType: string;
  confidence: number;
  reasoning: string;
  supportingKeywords: string[];
}

export interface ClarifyingQuestion {
  id: number;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
}

export interface EvidenceGuidanceItem {
  evidenceType: string;
  priority: number;
  guidanceText: string;
}

// US state names and abbreviations for jurisdiction detection
const STATE_MAP: Record<string, string> = {
  "alabama": "Alabama", "al": "Alabama",
  "alaska": "Alaska", "ak": "Alaska",
  "arizona": "Arizona", "az": "Arizona",
  "arkansas": "Arkansas", "ar": "Arkansas",
  "california": "California", "ca": "California",
  "colorado": "Colorado", "co": "Colorado",
  "connecticut": "Connecticut", "ct": "Connecticut",
  "delaware": "Delaware", "de": "Delaware",
  "florida": "Florida", "fl": "Florida",
  "georgia": "Georgia", "ga": "Georgia",
  "hawaii": "Hawaii", "hi": "Hawaii",
  "idaho": "Idaho", "id": "Idaho",
  "illinois": "Illinois", "il": "Illinois",
  "indiana": "Indiana", "in": "Indiana",
  "iowa": "Iowa", "ia": "Iowa",
  "kansas": "Kansas", "ks": "Kansas",
  "kentucky": "Kentucky", "ky": "Kentucky",
  "louisiana": "Louisiana", "la": "Louisiana",
  "maine": "Maine", "me": "Maine",
  "maryland": "Maryland", "md": "Maryland",
  "massachusetts": "Massachusetts", "ma": "Massachusetts",
  "michigan": "Michigan", "mi": "Michigan",
  "minnesota": "Minnesota", "mn": "Minnesota",
  "mississippi": "Mississippi", "ms": "Mississippi",
  "missouri": "Missouri", "mo": "Missouri",
  "montana": "Montana", "mt": "Montana",
  "nebraska": "Nebraska", "ne": "Nebraska",
  "nevada": "Nevada", "nv": "Nevada",
  "new hampshire": "New Hampshire", "nh": "New Hampshire",
  "new jersey": "New Jersey", "nj": "New Jersey",
  "new mexico": "New Mexico", "nm": "New Mexico",
  "new york": "New York", "ny": "New York",
  "north carolina": "North Carolina", "nc": "North Carolina",
  "north dakota": "North Dakota", "nd": "North Dakota",
  "ohio": "Ohio", "oh": "Ohio",
  "oklahoma": "Oklahoma", "ok": "Oklahoma",
  "oregon": "Oregon", "or": "Oregon",
  "pennsylvania": "Pennsylvania", "pa": "Pennsylvania",
  "rhode island": "Rhode Island", "ri": "Rhode Island",
  "south carolina": "South Carolina", "sc": "South Carolina",
  "south dakota": "South Dakota", "sd": "South Dakota",
  "tennessee": "Tennessee", "tn": "Tennessee",
  "texas": "Texas", "tx": "Texas",
  "utah": "Utah", "ut": "Utah",
  "vermont": "Vermont", "vt": "Vermont",
  "virginia": "Virginia", "va": "Virginia",
  "washington": "Washington", "wa": "Washington",
  "west virginia": "West Virginia", "wv": "West Virginia",
  "wisconsin": "Wisconsin", "wi": "Wisconsin",
  "wyoming": "Wyoming", "wy": "Wyoming",
  "district of columbia": "District of Columbia", "dc": "District of Columbia",
};

/**
 * Detect jurisdiction from story text using state name/abbreviation matching
 */
function detectJurisdiction(text: string): string {
  const lower = text.toLowerCase();
  // Check full state names first (longer matches first)
  const stateNames = Object.keys(STATE_MAP).sort((a, b) => b.length - a.length);
  for (const key of stateNames) {
    // For 2-letter abbreviations, require word boundary
    if (key.length === 2) {
      const regex = new RegExp(`\\b${key}\\b`, "i");
      if (regex.test(lower)) {
        return STATE_MAP[key];
      }
    } else {
      if (lower.includes(key)) {
        return STATE_MAP[key];
      }
    }
  }
  // Check for "federal" keywords
  if (/\bfederal\b|\bfed\b|\bu\.?s\.?\b/i.test(text)) {
    return "Federal";
  }
  return "Unknown";
}

/**
 * Start a new intake session: parse the user's story with keyword matching
 */
export async function startIntakeSession(userId: number | null, rawStory: string): Promise<IntakeSession> {
  const now = Date.now();

  // Keyword-based claim detection
  const storyLower = rawStory.toLowerCase();
  const keywordMap: Record<string, string[]> = {
    housing_discrimination: ["landlord", "eviction", "rent", "housing", "apartment", "lease", "tenant", "fair housing", "hud"],
    employment_discrimination: ["fired", "employer", "job", "workplace", "discrimination", "harass", "terminated", "wrongful termination"],
    consumer_fraud: ["scam", "fraud", "deceived", "misrepresent", "refund", "purchase", "false advertising"],
    insurance_bad_faith: ["insurance", "claim denied", "coverage", "policy", "adjuster", "denied claim", "bad faith"],
    medical_malpractice: ["doctor", "hospital", "surgery", "misdiagnos", "medical error", "malpractice", "negligent"],
    police_misconduct: ["police", "officer", "arrested", "excessive force", "brutality", "misconduct", "false arrest"],
    wage_theft: ["wages", "overtime", "unpaid", "paycheck", "minimum wage", "wage theft", "hours worked"],
    landlord_tenant: ["landlord", "repair", "deposit", "habitability", "mold", "lease violation", "security deposit"],
    debt_collection_abuse: ["debt collector", "collection", "harassing calls", "credit", "collection agency", "garnish"],
    predatory_lending: ["loan", "interest rate", "predatory", "mortgage", "payday loan", "lending", "refinance"],
    environmental_harm: ["pollution", "contamination", "toxic", "chemical", "water quality", "environmental"],
    product_liability: ["defective", "product", "injury", "recall", "manufacturer", "dangerous product"],
    civil_rights_violation: ["civil rights", "constitutional", "first amendment", "due process", "equal protection"],
    family_law: ["divorce", "custody", "child support", "alimony", "visitation", "domestic"],
    immigration: ["immigration", "visa", "deportation", "asylum", "green card", "uscis", "ice", "undocumented"],
    workers_compensation: ["work injury", "workers comp", "on the job", "workplace injury", "occupational"],
    social_security_disability: ["social security", "ssdi", "ssi", "disability benefits", "disability claim"],
    veterans_benefits: ["veteran", "va benefits", "military", "service-connected", "va claim", "gi bill"],
    education_rights: ["school", "iep", "special education", "expulsion", "student rights", "504 plan"],
    elder_abuse: ["elder", "nursing home", "elderly", "senior", "abuse of elderly", "neglect of elder"],
    disability_discrimination: ["disability", "ada", "accommodation", "accessible", "disabled"],
    retaliation: ["retaliation", "retaliated", "fired for reporting", "whistleblower retaliation"],
    whistleblower: ["whistleblower", "reported fraud", "qui tam", "false claims act"],
    government_benefits: ["benefits denied", "government benefits", "public assistance", "welfare"],
    disability_benefits: ["disability", "ssdi", "ssi", "disabled", "disability insurance", "unable to work"],
    medicaid: ["medicaid", "medical assistance", "medi-cal", "healthcare coverage", "medicaid denied"],
    snap: ["snap", "food stamps", "ebt", "food assistance", "supplemental nutrition"],
    veterans: ["veteran", "va", "military service", "combat", "service-connected", "veterans affairs"],
    unemployment: ["unemployment", "unemployment benefits", "laid off", "jobless", "unemployment insurance", "ui claim"],
    nursing_home: ["nursing home", "assisted living", "long-term care", "nursing facility", "resident rights"],
    guardianship: ["guardianship", "conservatorship", "ward", "incapacitated", "guardian"],
    child_welfare: ["cps", "child protective", "foster care", "child welfare", "dcfs", "child removal"],
  };

  let claimCandidates: ClaimCandidate[] = [];

  for (const [claimType, keywords] of Object.entries(keywordMap)) {
    const matchedKeywords = keywords.filter(k => storyLower.includes(k));
    const matchCount = matchedKeywords.length;
    if (matchCount >= 2) {
      claimCandidates.push({
        claimType,
        confidence: Math.min(0.9, matchCount * 0.2),
        reasoning: `Keyword matches: ${matchedKeywords.join(", ")}`,
        supportingKeywords: matchedKeywords,
      });
    }
  }
  claimCandidates.sort((a, b) => b.confidence - a.confidence);
  claimCandidates = claimCandidates.slice(0, 3);
  const overallConfidence = claimCandidates.length > 0 ? claimCandidates[0].confidence : 0;

  // Detect jurisdiction from text
  const jurisdictionGuess = detectJurisdiction(rawStory);

  // Save session
  await db.execute(sql`
    INSERT INTO problem_intake_sessions 
    (user_id, raw_story, jurisdiction_guess, claim_candidates, confidence_score, status, created_at, updated_at)
    VALUES (${userId}, ${rawStory}, ${jurisdictionGuess}, 
            ${JSON.stringify(claimCandidates)}, ${overallConfidence}, 'analyzed', ${now}, ${now})
  `);

  const sessionResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  const sessionId = (sessionResult[0] as unknown as any[])[0]?.id;

  // Save individual claim matches
  for (const claim of claimCandidates) {
    await db.execute(sql`
      INSERT INTO interpreter_claim_matches 
      (session_id, claim_type, confidence_score, reasoning_summary, supporting_keywords, created_at)
      VALUES (${sessionId}, ${claim.claimType}, ${claim.confidence}, 
              ${claim.reasoning}, ${JSON.stringify(claim.supportingKeywords)}, ${now})
    `);
  }

  return {
    id: sessionId,
    rawStory,
    jurisdictionGuess,
    claimCandidates,
    selectedClaim: null,
    confidenceScore: overallConfidence,
    status: "analyzed",
    createdAt: now,
  };
}

/**
 * Get clarifying questions for a claim type
 */
export async function getClarifyingQuestions(claimType: string): Promise<ClarifyingQuestion[]> {
  // Check DB first
  const dbQuestions = await db.execute(sql`
    SELECT id, question_text, question_type, answer_options
    FROM interpreter_question_flow
    WHERE claim_type = ${claimType}
    ORDER BY weight DESC
    LIMIT 5
  `);

  if ((dbQuestions[0] as unknown as any[]).length > 0) {
    return (dbQuestions[0] as unknown as any[]).map(q => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type || "text",
      answerOptions: q.answer_options ? (typeof q.answer_options === 'string' ? JSON.parse(q.answer_options) : q.answer_options) : null,
    }));
  }

  // Generate default questions based on claim type
  const defaultQuestions: Record<string, ClarifyingQuestion[]> = {
    housing_discrimination: [
      { id: 0, questionText: "What type of housing is involved (apartment, house, public housing)?", questionType: "select", answerOptions: ["Apartment", "House", "Public Housing", "Mobile Home", "Other"] },
      { id: 0, questionText: "When did this incident occur?", questionType: "text", answerOptions: null },
      { id: 0, questionText: "Do you believe the discrimination was based on race, gender, disability, familial status, or another protected class?", questionType: "select", answerOptions: ["Race", "Gender", "Disability", "Familial Status", "Religion", "National Origin", "Other"] },
      { id: 0, questionText: "Have you filed a complaint with HUD or a local fair housing agency?", questionType: "select", answerOptions: ["Yes", "No", "Not sure"] },
    ],
    employment_discrimination: [
      { id: 0, questionText: "What is your employment status (current employee, former employee, applicant)?", questionType: "select", answerOptions: ["Current Employee", "Former Employee", "Applicant", "Contractor"] },
      { id: 0, questionText: "What type of discrimination did you experience?", questionType: "select", answerOptions: ["Race", "Gender", "Age", "Disability", "Religion", "Pregnancy", "Retaliation", "Other"] },
      { id: 0, questionText: "How many employees does your employer have?", questionType: "select", answerOptions: ["1-14", "15-50", "51-100", "100+", "Not sure"] },
      { id: 0, questionText: "Have you filed a complaint with the EEOC?", questionType: "select", answerOptions: ["Yes", "No", "Not sure"] },
    ],
    consumer_fraud: [
      { id: 0, questionText: "What type of product or service was involved?", questionType: "text", answerOptions: null },
      { id: 0, questionText: "How much money was involved?", questionType: "select", answerOptions: ["Under $500", "$500-$5,000", "$5,000-$25,000", "$25,000+"] },
      { id: 0, questionText: "Did the company make specific promises or guarantees?", questionType: "select", answerOptions: ["Yes, in writing", "Yes, verbally", "No", "Not sure"] },
      { id: 0, questionText: "Have you attempted to resolve this with the company?", questionType: "select", answerOptions: ["Yes", "No"] },
    ],
  };

  // Return default or generic questions
  return defaultQuestions[claimType] || [
    { id: 0, questionText: "When did this situation begin?", questionType: "text", answerOptions: null },
    { id: 0, questionText: "Where did this occur (city, state)?", questionType: "text", answerOptions: null },
    { id: 0, questionText: "Have you spoken with an attorney about this?", questionType: "select", answerOptions: ["Yes", "No"] },
    { id: 0, questionText: "Do you have any documentation related to this issue?", questionType: "select", answerOptions: ["Yes", "Some", "No"] },
  ];
}

/**
 * Get evidence guidance for a claim type
 */
export async function getEvidenceGuidance(claimType: string): Promise<EvidenceGuidanceItem[]> {
  // Check DB first
  const dbGuidance = await db.execute(sql`
    SELECT evidence_type, priority, guidance_text
    FROM interpreter_evidence_guidance
    WHERE claim_type = ${claimType}
    ORDER BY priority ASC
  `);

  if ((dbGuidance[0] as unknown as any[]).length > 0) {
    return (dbGuidance[0] as unknown as any[]).map(g => ({
      evidenceType: g.evidence_type,
      priority: g.priority,
      guidanceText: g.guidance_text,
    }));
  }

  // Default evidence guidance
  const defaultGuidance: Record<string, EvidenceGuidanceItem[]> = {
    housing_discrimination: [
      { evidenceType: "Communications", priority: 1, guidanceText: "Save all emails, texts, and letters with your landlord or property manager." },
      { evidenceType: "Lease Agreement", priority: 1, guidanceText: "Keep a copy of your lease and any amendments." },
      { evidenceType: "Photos/Videos", priority: 2, guidanceText: "Document the condition of the property with dated photos." },
      { evidenceType: "Witness Statements", priority: 2, guidanceText: "Identify neighbors or others who witnessed discriminatory behavior." },
      { evidenceType: "Complaint Records", priority: 3, guidanceText: "Keep copies of any complaints filed with HUD or local agencies." },
    ],
    employment_discrimination: [
      { evidenceType: "Employment Records", priority: 1, guidanceText: "Gather pay stubs, performance reviews, and employment contracts." },
      { evidenceType: "Communications", priority: 1, guidanceText: "Save emails, texts, and written communications with your employer." },
      { evidenceType: "Incident Log", priority: 1, guidanceText: "Create a detailed timeline of discriminatory incidents with dates." },
      { evidenceType: "Witness Information", priority: 2, guidanceText: "Identify coworkers who witnessed the discrimination." },
      { evidenceType: "Company Policies", priority: 3, guidanceText: "Obtain copies of the employee handbook and relevant policies." },
    ],
    consumer_fraud: [
      { evidenceType: "Purchase Records", priority: 1, guidanceText: "Keep receipts, invoices, and proof of payment." },
      { evidenceType: "Advertisements", priority: 1, guidanceText: "Save screenshots of ads, marketing materials, or promises made." },
      { evidenceType: "Communications", priority: 1, guidanceText: "Document all interactions with the company (emails, chat logs, call records)." },
      { evidenceType: "Product Documentation", priority: 2, guidanceText: "Keep the product, packaging, and any warranties or guarantees." },
      { evidenceType: "Expert Assessment", priority: 3, guidanceText: "If applicable, get an independent assessment of the product or service." },
    ],
  };

  return defaultGuidance[claimType] || [
    { evidenceType: "Written Communications", priority: 1, guidanceText: "Save all emails, letters, and text messages related to your situation." },
    { evidenceType: "Financial Records", priority: 1, guidanceText: "Gather receipts, invoices, bank statements, and other financial documents." },
    { evidenceType: "Timeline", priority: 2, guidanceText: "Create a detailed chronological account of events with specific dates." },
    { evidenceType: "Witness Information", priority: 2, guidanceText: "Identify anyone who can corroborate your account." },
    { evidenceType: "Official Records", priority: 3, guidanceText: "Obtain any police reports, government filings, or official correspondence." },
  ];
}

/**
 * Get a session by ID
 */
export async function getIntakeSession(sessionId: number): Promise<IntakeSession | null> {
  const result = await db.execute(sql`
    SELECT id, raw_story, jurisdiction_guess, claim_candidates, selected_claim,
           confidence_score, status, created_at
    FROM problem_intake_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `);

  const row = (result[0] as unknown as any[])[0];
  if (!row) return null;

  return {
    id: row.id,
    rawStory: row.raw_story,
    jurisdictionGuess: row.jurisdiction_guess,
    claimCandidates: row.claim_candidates ? (typeof row.claim_candidates === 'string' ? JSON.parse(row.claim_candidates) : row.claim_candidates) : [],
    selectedClaim: row.selected_claim,
    confidenceScore: Number(row.confidence_score) || 0,
    status: row.status,
    createdAt: Number(row.created_at),
  };
}

/**
 * Get all sessions for a user
 */
export async function getUserSessions(userId: number): Promise<IntakeSession[]> {
  const results = await db.execute(sql`
    SELECT id, raw_story, jurisdiction_guess, claim_candidates, selected_claim,
           confidence_score, status, created_at
    FROM problem_intake_sessions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return (results[0] as unknown as any[]).map(row => ({
    id: row.id,
    rawStory: row.raw_story,
    jurisdictionGuess: row.jurisdiction_guess,
    claimCandidates: row.claim_candidates ? (typeof row.claim_candidates === 'string' ? JSON.parse(row.claim_candidates) : row.claim_candidates) : [],
    selectedClaim: row.selected_claim,
    confidenceScore: Number(row.confidence_score) || 0,
    status: row.status,
    createdAt: Number(row.created_at),
  }));
}
