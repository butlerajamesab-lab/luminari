/**
 * Claim-to-Remedy Pipeline
 *
 * CTR1. Claim Intake — create claim record attached to case
 * CTR2. Claim Classification — validate type, find statutes, recommend templates
 * CTR3. Evidence Requirements — generate evidence checklist per claim type
 * CTR4. Remedy Connection — connect to templates and settlement calculator
 * CTR5. Full Pipeline — run all steps in sequence
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── CTR1. Claim Intake ─────────────────────────────────────────────────────
export interface ClaimIntakeInput {
  caseId: number;
  claimType: string;
  jurisdiction: string;
  eventDates?: string[];
  actorsInvolved?: string[];
  damagesAmount?: number;
  evidenceAvailable?: string[];
  description?: string;
}

export interface ClaimRecord {
  claimId: number;
  caseId: number;
  claimType: string;
  jurisdiction: string;
  status: string;
  createdAt: number;
}

export async function createClaimIntake(input: ClaimIntakeInput): Promise<ClaimRecord> {
  const nowMs = Date.now();
  const [result] = await db.execute(sql`
    INSERT INTO claim_intake (case_id, user_id, claim_type, jurisdiction, event_dates,
      actors_involved, damages_amount, evidence_available, description, pipeline_stage, submission_status, created_at, updated_at)
    VALUES (${input.caseId}, 0, ${input.claimType}, ${input.jurisdiction},
      ${input.eventDates ? JSON.stringify(input.eventDates) : null},
      ${input.actorsInvolved ? JSON.stringify(input.actorsInvolved) : null},
      ${input.damagesAmount || 0},
      ${input.evidenceAvailable ? JSON.stringify(input.evidenceAvailable) : null},
      ${input.description || null}, 'intake', 'pending', ${nowMs}, ${nowMs})
  `);
  return {
    claimId: (result as any).insertId,
    caseId: input.caseId,
    claimType: input.claimType,
    jurisdiction: input.jurisdiction,
    status: 'intake',
    createdAt: nowMs,
  };
}

// ─── CTR2. Claim Classification ─────────────────────────────────────────────
export interface ClassificationResult {
  validatedClaimType: string;
  relevantStatutes: string[];
  recommendedTemplateTypes: string[];
  requiredEvidence: string[];
  claimStrength: 'strong' | 'moderate' | 'weak';
}

const CLAIM_STATUTES: Record<string, string[]> = {
  wage_theft: ['FLSA 29 USC §201', 'RCW 49.48', 'CA Labor Code §200', 'NY Labor Law §190', 'TX Payday Law'],
  housing_discrimination: ['Fair Housing Act 42 USC §3601', 'RCW 49.60', 'CA FEHA', 'NY Human Rights Law'],
  consumer_fraud: ['FTC Act 15 USC §45', 'WA CPA RCW 19.86', 'CA UCL Bus & Prof §17200', 'NY GBL §349'],
  debt_collection_harassment: ['FDCPA 15 USC §1692', 'RCW 19.16', 'CA Rosenthal Act', 'NY CDPA'],
  security_deposit: ['RCW 59.18.280', 'CA Civil Code §1950.5', 'NY GOL §7-108'],
  habitability_violation: ['Implied Warranty of Habitability', 'RCW 59.18.060', 'CA Civil Code §1941'],
  ssdi_denial: ['42 USC §405(g)', 'SSA Regulations 20 CFR Part 404'],
  ssi_denial: ['42 USC §1383(c)', 'SSA Regulations 20 CFR Part 416'],
  public_records_violation: ['FOIA 5 USC §552', 'WA PRA RCW 42.56', 'CA PRA Gov Code §6250'],
  overtime_violation: ['FLSA 29 USC §207', 'RCW 49.46.130', 'CA Labor Code §510'],
};

const CLAIM_TEMPLATE_TYPES: Record<string, string[]> = {
  wage_theft: ['demand_letter', 'agency_complaint', 'small_claims_complaint'],
  housing_discrimination: ['demand_letter', 'hud_complaint', 'agency_complaint'],
  consumer_fraud: ['demand_letter', 'ag_complaint', 'small_claims_complaint'],
  debt_collection_harassment: ['cease_and_desist', 'cfpb_complaint', 'demand_letter'],
  security_deposit: ['demand_letter', 'small_claims_complaint'],
  habitability_violation: ['notice_to_landlord', 'demand_letter', 'agency_complaint'],
  ssdi_denial: ['appeal_request', 'reconsideration_request'],
  ssi_denial: ['appeal_request', 'reconsideration_request'],
  public_records_violation: ['records_request', 'appeal_letter', 'demand_letter'],
  overtime_violation: ['demand_letter', 'agency_complaint', 'small_claims_complaint'],
};

export function classifyClaim(
  claimType: string,
  evidenceTags: string[] = [],
  jurisdiction: string = 'federal'
): ClassificationResult {
  const statutes = CLAIM_STATUTES[claimType] || [];
  // Filter statutes by jurisdiction
  const jurisdictionMap: Record<string, string> = {
    WA: 'RCW', CA: 'CA', NY: 'NY', TX: 'TX', federal: 'USC',
  };
  const prefix = jurisdictionMap[jurisdiction];
  const relevantStatutes = prefix
    ? statutes.filter(s => s.includes(prefix) || s.includes('USC'))
    : statutes;

  const recommendedTemplateTypes = CLAIM_TEMPLATE_TYPES[claimType] || ['demand_letter'];
  const requiredEvidence = getEvidenceRequirements(claimType);

  // Determine claim strength based on evidence coverage
  const evidenceHits = requiredEvidence.filter(req =>
    evidenceTags.some(tag => req.toLowerCase().includes(tag.toLowerCase()) || tag.toLowerCase().includes(req.toLowerCase()))
  );
  const coverage = requiredEvidence.length > 0 ? evidenceHits.length / requiredEvidence.length : 0;
  const claimStrength: ClassificationResult['claimStrength'] =
    coverage >= 0.6 ? 'strong' : coverage >= 0.3 ? 'moderate' : 'weak';

  return {
    validatedClaimType: claimType,
    relevantStatutes,
    recommendedTemplateTypes,
    requiredEvidence,
    claimStrength,
  };
}

// ─── CTR3. Evidence Requirements ────────────────────────────────────────────
export interface EvidenceChecklist {
  claimType: string;
  requiredEvidence: { item: string; category: string; priority: 'critical' | 'important' | 'helpful' }[];
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'insufficient';
  missingEvidence: string[];
  recommendedSources: string[];
}

const EVIDENCE_REQUIREMENTS: Record<string, { item: string; category: string; priority: 'critical' | 'important' | 'helpful' }[]> = {
  wage_theft: [
    { item: 'Pay stubs', category: 'financial', priority: 'critical' },
    { item: 'Timesheets or time records', category: 'employment', priority: 'critical' },
    { item: 'Employment agreement or offer letter', category: 'employment', priority: 'important' },
    { item: 'Witness statements', category: 'testimony', priority: 'important' },
    { item: 'Bank deposit records', category: 'financial', priority: 'helpful' },
    { item: 'Communication with employer about pay', category: 'correspondence', priority: 'helpful' },
  ],
  housing_discrimination: [
    { item: 'Rental application record', category: 'housing', priority: 'critical' },
    { item: 'Communication logs with landlord', category: 'correspondence', priority: 'critical' },
    { item: 'Witness statements', category: 'testimony', priority: 'important' },
    { item: 'Comparative tenant data', category: 'housing', priority: 'important' },
    { item: 'Photos or videos of property conditions', category: 'evidence', priority: 'helpful' },
    { item: 'Lease agreement', category: 'housing', priority: 'helpful' },
  ],
  consumer_fraud: [
    { item: 'Purchase receipt or contract', category: 'financial', priority: 'critical' },
    { item: 'Product/service documentation', category: 'evidence', priority: 'critical' },
    { item: 'Advertising materials or claims', category: 'evidence', priority: 'important' },
    { item: 'Communication with seller', category: 'correspondence', priority: 'important' },
    { item: 'Bank/credit card statements', category: 'financial', priority: 'helpful' },
  ],
  debt_collection_harassment: [
    { item: 'Call logs showing frequency', category: 'evidence', priority: 'critical' },
    { item: 'Written communications from collector', category: 'correspondence', priority: 'critical' },
    { item: 'Voicemail recordings', category: 'evidence', priority: 'important' },
    { item: 'Original debt documentation', category: 'financial', priority: 'important' },
    { item: 'Witness statements', category: 'testimony', priority: 'helpful' },
  ],
  security_deposit: [
    { item: 'Lease agreement', category: 'housing', priority: 'critical' },
    { item: 'Move-in/move-out inspection reports', category: 'housing', priority: 'critical' },
    { item: 'Photos of unit condition', category: 'evidence', priority: 'important' },
    { item: 'Deposit receipt', category: 'financial', priority: 'important' },
    { item: 'Communication with landlord', category: 'correspondence', priority: 'helpful' },
  ],
  habitability_violation: [
    { item: 'Photos/videos of conditions', category: 'evidence', priority: 'critical' },
    { item: 'Written complaints to landlord', category: 'correspondence', priority: 'critical' },
    { item: 'Repair requests and responses', category: 'correspondence', priority: 'important' },
    { item: 'Health/building inspection reports', category: 'evidence', priority: 'important' },
    { item: 'Lease agreement', category: 'housing', priority: 'helpful' },
  ],
  ssdi_denial: [
    { item: 'Denial letter from SSA', category: 'government', priority: 'critical' },
    { item: 'Medical records', category: 'medical', priority: 'critical' },
    { item: 'Doctor statements about limitations', category: 'medical', priority: 'important' },
    { item: 'Work history records', category: 'employment', priority: 'important' },
    { item: 'Prescription records', category: 'medical', priority: 'helpful' },
  ],
  ssi_denial: [
    { item: 'Denial letter from SSA', category: 'government', priority: 'critical' },
    { item: 'Medical records', category: 'medical', priority: 'critical' },
    { item: 'Financial records showing need', category: 'financial', priority: 'important' },
    { item: 'Doctor statements', category: 'medical', priority: 'important' },
  ],
  public_records_violation: [
    { item: 'Original records request', category: 'government', priority: 'critical' },
    { item: 'Agency response or non-response', category: 'government', priority: 'critical' },
    { item: 'Follow-up communications', category: 'correspondence', priority: 'important' },
    { item: 'Proof of submission', category: 'evidence', priority: 'important' },
  ],
  overtime_violation: [
    { item: 'Pay stubs showing hours worked', category: 'financial', priority: 'critical' },
    { item: 'Timesheets or clock records', category: 'employment', priority: 'critical' },
    { item: 'Employment agreement', category: 'employment', priority: 'important' },
    { item: 'Communication about overtime', category: 'correspondence', priority: 'helpful' },
  ],
};

export function getEvidenceRequirements(claimType: string): string[] {
  return (EVIDENCE_REQUIREMENTS[claimType] || []).map(e => e.item);
}

export function generateEvidenceChecklist(
  claimType: string,
  existingEvidence: string[] = []
): EvidenceChecklist {
  const requirements = EVIDENCE_REQUIREMENTS[claimType] || [];
  const missing = requirements
    .filter(req => !existingEvidence.some(e =>
      e.toLowerCase().includes(req.item.toLowerCase()) ||
      req.item.toLowerCase().includes(e.toLowerCase())
    ))
    .map(req => req.item);

  const coverage = requirements.length > 0
    ? (requirements.length - missing.length) / requirements.length : 0;
  const evidenceStrength: EvidenceChecklist['evidenceStrength'] =
    coverage >= 0.75 ? 'strong' :
    coverage >= 0.5 ? 'moderate' :
    coverage >= 0.25 ? 'weak' : 'insufficient';

  const recommendedSources: string[] = [];
  if (missing.some(m => m.toLowerCase().includes('pay') || m.toLowerCase().includes('financial')))
    recommendedSources.push('Bank statements, payroll records');
  if (missing.some(m => m.toLowerCase().includes('witness')))
    recommendedSources.push('Co-workers, neighbors, or other witnesses');
  if (missing.some(m => m.toLowerCase().includes('photo') || m.toLowerCase().includes('video')))
    recommendedSources.push('Take dated photos/videos of current conditions');
  if (missing.some(m => m.toLowerCase().includes('communication') || m.toLowerCase().includes('correspondence')))
    recommendedSources.push('Email, text messages, or written letters');
  if (missing.some(m => m.toLowerCase().includes('medical')))
    recommendedSources.push('Request medical records from healthcare providers');

  return {
    claimType,
    requiredEvidence: requirements,
    evidenceStrength,
    missingEvidence: missing,
    recommendedSources,
  };
}

// ─── CTR4. Remedy Connection ────────────────────────────────────────────────
export interface RemedyRecommendation {
  claimType: string;
  jurisdiction: string;
  recommendedTemplates: { templateType: string; description: string }[];
  settlementInputs: Record<string, number>;
  evidenceStrength: string;
}

export function buildRemedyRecommendation(
  claimType: string,
  jurisdiction: string,
  damagesAmount: number,
  evidenceStrength: string
): RemedyRecommendation {
  const templateTypes = CLAIM_TEMPLATE_TYPES[claimType] || ['demand_letter'];
  const recommendedTemplates = templateTypes.map(t => ({
    templateType: t,
    description: TEMPLATE_DESCRIPTIONS[t] || t.replace(/_/g, ' '),
  }));

  // Build settlement calculator inputs based on claim type
  const settlementInputs: Record<string, number> = {};
  switch (claimType) {
    case 'wage_theft':
      settlementInputs.unpaid_wages = damagesAmount;
      settlementInputs.weeks_unpaid = 4;
      break;
    case 'housing_discrimination':
      settlementInputs.monthly_rent = damagesAmount;
      settlementInputs.months_affected = 6;
      break;
    case 'consumer_fraud':
      settlementInputs.amount_paid = damagesAmount;
      settlementInputs.actual_value = Math.round(damagesAmount * 0.3);
      break;
    case 'debt_collection_harassment':
      settlementInputs.violations_count = 10;
      break;
    case 'security_deposit':
      settlementInputs.deposit_amount = damagesAmount;
      break;
    default:
      settlementInputs.base_amount = damagesAmount;
  }

  return {
    claimType,
    jurisdiction,
    recommendedTemplates,
    settlementInputs,
    evidenceStrength,
  };
}

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  demand_letter: 'Formal demand letter to the opposing party',
  agency_complaint: 'Complaint filed with regulatory agency',
  small_claims_complaint: 'Small claims court complaint form',
  hud_complaint: 'HUD fair housing discrimination complaint',
  ag_complaint: 'Attorney General consumer protection complaint',
  cease_and_desist: 'Cease and desist letter to debt collector',
  cfpb_complaint: 'Consumer Financial Protection Bureau complaint',
  notice_to_landlord: 'Formal notice to landlord of violations',
  appeal_request: 'Appeal of agency decision or denial',
  reconsideration_request: 'Request for reconsideration',
  records_request: 'Public records request',
  appeal_letter: 'Appeal of records request denial',
};

// ─── CTR5. Full Pipeline ────────────────────────────────────────────────────
export interface PipelineResult {
  claim: ClaimRecord;
  classification: ClassificationResult;
  evidenceChecklist: EvidenceChecklist;
  remedyRecommendation: RemedyRecommendation;
  pipelineStage: string;
}

export async function runClaimToRemedyPipeline(input: ClaimIntakeInput): Promise<PipelineResult> {
  // Step 1: Create claim
  const claim = await createClaimIntake(input);

  // Step 2: Classify
  const classification = classifyClaim(
    input.claimType,
    input.evidenceAvailable || [],
    input.jurisdiction
  );

  // Step 3: Evidence checklist
  const evidenceChecklist = generateEvidenceChecklist(
    input.claimType,
    input.evidenceAvailable || []
  );

  // Step 4: Remedy recommendation
  const remedyRecommendation = buildRemedyRecommendation(
    input.claimType,
    input.jurisdiction,
    input.damagesAmount || 0,
    evidenceChecklist.evidenceStrength
  );

  // Update claim status
  await db.execute(sql`
    UPDATE claim_intake SET pipeline_stage = 'classified', submission_status = 'processed', updated_at = ${Date.now()}
    WHERE id = ${claim.claimId}
  `);

  return {
    claim,
    classification,
    evidenceChecklist,
    remedyRecommendation,
    pipelineStage: 'classified',
  };
}

// ─── CTR6. Get Claims for Case ──────────────────────────────────────────────
export async function getClaimsForCase(caseId: number): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT * FROM claim_intake WHERE case_id = ${caseId} ORDER BY created_at DESC
  `);
  return rows as unknown as any[];
}

export async function getClaimById(claimId: number): Promise<any> {
  const [rows] = await db.execute(sql`
    SELECT * FROM claim_intake WHERE id = ${claimId}
  `);
  return (rows as unknown as any[])[0] || null;
}
