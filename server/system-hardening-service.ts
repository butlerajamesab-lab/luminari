/**
 * System Hardening Service
 *
 * SH1. Primary Action Rule — every decision panel shows situation summary, recommendation, single next step
 * SH2. Evidence Confidence Indicators — standardized panel for all engine outputs
 * SH3. Workflow State Tracking — case progress through 9 stages
 * SH4. Strategy Output Guardrail — flag_for_review if confidence < 60%
 * SH5. Remedy Generator Guardrail — estimate_only if critical inputs missing
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── SH1. Primary Action Rule ──────────────────────────────────────────────
export interface PrimaryAction {
  situationSummary: string;
  recommendationReason: string;
  nextBestStep: {
    action: string;
    label: string;
    targetEngine: string;
    params?: Record<string, any>;
  };
  secondaryActions: {
    action: string;
    label: string;
    targetEngine: string;
  }[];
}

export async function getPrimaryAction(caseId: number): Promise<PrimaryAction> {
  // Get workflow state
  const [wsRows] = await db.execute(sql`
    SELECT * FROM case_workflow_state WHERE case_id = ${caseId}
  `);
  const ws = (wsRows as unknown as any[])[0];

  // Get case info
  const [caseRows] = await db.execute(sql`
    SELECT * FROM cases WHERE id = ${caseId}
  `);
  const caseData = (caseRows as unknown as any[])[0];

  if (!ws) {
    // No workflow state yet — start with pattern detection
    return {
      situationSummary: `Case "${caseData?.name || caseId}" has not entered the operational pipeline yet.`,
      recommendationReason: 'No patterns have been detected for this case. Begin by running pattern detection to identify systemic issues.',
      nextBestStep: {
        action: 'detect_patterns',
        label: 'Run Pattern Detection',
        targetEngine: 'pattern_detection',
        params: { caseId },
      },
      secondaryActions: [
        { action: 'add_evidence', label: 'Add More Evidence', targetEngine: 'evidence_lab' },
        { action: 'manual_claim', label: 'File Manual Claim', targetEngine: 'claim_intake' },
      ],
    };
  }

  // Determine the next step based on workflow state
  if (ws.blocked_stage) {
    return {
      situationSummary: `Case is blocked at "${ws.blocked_stage}" stage. ${ws.blocked_reason || 'Missing information required.'}`,
      recommendationReason: `The pipeline cannot proceed until the blocking condition is resolved.`,
      nextBestStep: {
        action: 'resolve_block',
        label: `Resolve: ${ws.blocked_reason || 'Provide missing information'}`,
        targetEngine: ws.blocked_stage,
        params: { caseId, missingInfo: parseJson(ws.missing_info, []) },
      },
      secondaryActions: [
        { action: 'skip_stage', label: 'Skip This Stage', targetEngine: 'workflow' },
        { action: 'add_evidence', label: 'Add Evidence', targetEngine: 'evidence_lab' },
      ],
    };
  }

  if (!ws.pattern_detected) {
    return buildAction(caseData, 'No patterns detected yet.', 'Run pattern detection to identify systemic issues.',
      { action: 'detect_patterns', label: 'Run Pattern Detection', targetEngine: 'pattern_detection', params: { caseId } },
      [{ action: 'add_evidence', label: 'Add More Evidence', targetEngine: 'evidence_lab' }]);
  }
  if (!ws.pattern_linked) {
    return buildAction(caseData, 'Patterns detected but not linked to case.', 'Link detected patterns to build the case profile.',
      { action: 'link_patterns', label: 'Link Patterns to Case', targetEngine: 'case_pattern_pipeline', params: { caseId } },
      [{ action: 'view_patterns', label: 'View Detected Patterns', targetEngine: 'diagnostics' }]);
  }
  if (!ws.strategy_generated) {
    return buildAction(caseData, 'Patterns linked. No strategy generated.', 'Generate a strategy path based on linked patterns.',
      { action: 'generate_strategy', label: 'Generate Strategy', targetEngine: 'systemic_strategy', params: { caseId } },
      [{ action: 'manual_strategy', label: 'Create Manual Strategy', targetEngine: 'strategy_review' }]);
  }
  if (!ws.strategy_approved) {
    return buildAction(caseData, 'Strategy generated. Awaiting review.', 'Review and approve the generated strategy to proceed.',
      { action: 'review_strategy', label: 'Review Strategy', targetEngine: 'strategy_review', params: { caseId } },
      [{ action: 'modify_strategy', label: 'Modify Strategy', targetEngine: 'strategy_review' },
       { action: 'reject_strategy', label: 'Reject & Regenerate', targetEngine: 'strategy_review' }]);
  }
  if (!ws.remedy_activated) {
    return buildAction(caseData, 'Strategy approved. Remedy path not yet activated.', 'Activate the remedy path to begin generating documents.',
      { action: 'activate_remedy', label: 'Activate Remedy Path', targetEngine: 'remedy_generator', params: { caseId } },
      [{ action: 'calculate_settlement', label: 'Calculate Settlement', targetEngine: 'settlement_calculator' }]);
  }
  if (!ws.documents_generated) {
    return buildAction(caseData, 'Remedy active. Documents not yet generated.', 'Generate required documents from remedy templates.',
      { action: 'generate_documents', label: 'Generate Documents', targetEngine: 'remedy_generator', params: { caseId } },
      [{ action: 'view_templates', label: 'Browse Templates', targetEngine: 'remedy_templates' }]);
  }
  if (!ws.submission_sent) {
    return buildAction(caseData, 'Documents ready. Not yet submitted.', 'Submit documents to the appropriate authority.',
      { action: 'submit', label: 'Submit Documents', targetEngine: 'escalation', params: { caseId } },
      [{ action: 'export_docs', label: 'Export Documents', targetEngine: 'document_export' },
       { action: 'lumensend', label: 'Send via LumenSend', targetEngine: 'lumensend' }]);
  }
  if (!ws.outcome_recorded) {
    return buildAction(caseData, 'Submission sent. Awaiting outcome.', 'Record the outcome when a response is received.',
      { action: 'record_outcome', label: 'Record Outcome', targetEngine: 'outcome_engine', params: { caseId } },
      [{ action: 'track_status', label: 'Track Submission Status', targetEngine: 'submission_tracking' }]);
  }
  if (!ws.learning_applied) {
    return buildAction(caseData, 'Outcome recorded. Learning loop pending.', 'Apply learning from this outcome to improve future strategies.',
      { action: 'apply_learning', label: 'Run Learning Loop', targetEngine: 'learning_loop', params: { caseId } },
      [{ action: 'view_outcome', label: 'View Outcome Details', targetEngine: 'outcome_engine' }]);
  }

  // All stages complete
  return {
    situationSummary: `Case "${caseData?.name || caseId}" has completed the full operational loop.`,
    recommendationReason: 'All pipeline stages are complete. The learning loop has been applied.',
    nextBestStep: {
      action: 'view_summary',
      label: 'View Case Summary',
      targetEngine: 'workbench',
      params: { caseId },
    },
    secondaryActions: [
      { action: 'new_claim', label: 'File New Claim', targetEngine: 'claim_intake' },
      { action: 'export_report', label: 'Export Case Report', targetEngine: 'document_export' },
    ],
  };
}

function buildAction(caseData: any, summary: string, reason: string,
  next: PrimaryAction['nextBestStep'], secondary: PrimaryAction['secondaryActions']): PrimaryAction {
  return {
    situationSummary: `Case "${caseData?.name || 'Unknown'}": ${summary}`,
    recommendationReason: reason,
    nextBestStep: next,
    secondaryActions: secondary,
  };
}

// ─── SH2. Evidence Confidence Indicators ────────────────────────────────────
export interface EvidenceConfidence {
  overallStrength: 'strong' | 'moderate' | 'weak' | 'insufficient';
  overallScore: number;
  requiredDocumentsMissing: string[];
  patternConfidence: number;
  settlementConfidence: number;
  signalConfidence: number;
  evidenceCount: number;
  documentCount: number;
  recommendations: string[];
}

export async function getEvidenceConfidence(caseId: number): Promise<EvidenceConfidence> {
  // Count evidence items
  const [evRows] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM evidence_items WHERE caseId = ${caseId}
  `);
  const evidenceCount = Number((evRows as unknown as any[])[0]?.cnt) || 0;

  // Count documents
  let documentCount = 0;
  try {
    const [docRows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM evidence_items WHERE caseId = ${caseId} AND evidenceType IN ('document','filing','correspondence','report')
    `);
    documentCount = Number((docRows as unknown as any[])[0]?.cnt) || 0;
  } catch { /* table might not exist */ }

  // Get pattern confidence for this case
  let patternConfidence = 0;
  try {
    const [pcRows] = await db.execute(sql`
      SELECT AVG(confidence_score) as avg_conf FROM case_pattern_links WHERE case_id = ${caseId}
    `);
    patternConfidence = Number((pcRows as unknown as any[])[0]?.avg_conf) || 0;
  } catch { /* table might not exist yet */ }

  // Get settlement confidence from recent calculations
  let settlementConfidence = 0;
  try {
    const [scRows] = await db.execute(sql`
      SELECT AVG(confidence_level) as avg_conf FROM settlement_calculations WHERE case_id = ${caseId}
    `);
    settlementConfidence = Number((scRows as unknown as any[])[0]?.avg_conf) || 0;
  } catch { /* no calculations yet */ }

  // Signal confidence
  let signalConfidence = 0;
  try {
    const [sigRows] = await db.execute(sql`
      SELECT AVG(ds.confidence_score) as avg_conf
      FROM detected_signals ds
      JOIN case_pattern_links cpl ON ds.signal_id = cpl.signal_id
      WHERE cpl.case_id = ${caseId}
    `);
    signalConfidence = Number((sigRows as unknown as any[])[0]?.avg_conf) || 0;
  } catch { /* no signals linked */ }

  // Calculate overall score
  const weights = { evidence: 0.3, pattern: 0.25, settlement: 0.2, signal: 0.25 };
  const evidenceScore = Math.min(evidenceCount * 10, 100);
  const overallScore = Math.round(
    evidenceScore * weights.evidence +
    patternConfidence * weights.pattern +
    settlementConfidence * weights.settlement +
    signalConfidence * weights.signal
  );

  const overallStrength: EvidenceConfidence['overallStrength'] =
    overallScore >= 75 ? 'strong' :
    overallScore >= 50 ? 'moderate' :
    overallScore >= 25 ? 'weak' : 'insufficient';

  // Determine missing documents
  const requiredDocumentsMissing: string[] = [];
  const recommendations: string[] = [];

  if (evidenceCount < 3) {
    requiredDocumentsMissing.push('Additional evidence items needed (minimum 3)');
    recommendations.push('Add more evidence items to strengthen the case');
  }
  if (documentCount < 1) {
    requiredDocumentsMissing.push('Supporting documents (contracts, correspondence, records)');
    recommendations.push('Upload supporting documents to establish a paper trail');
  }
  if (patternConfidence < 50) {
    recommendations.push('Run pattern detection to identify systemic issues');
  }
  if (settlementConfidence < 50) {
    recommendations.push('Run settlement calculator with complete case facts');
  }

  return {
    overallStrength,
    overallScore,
    requiredDocumentsMissing,
    patternConfidence,
    settlementConfidence,
    signalConfidence,
    evidenceCount,
    documentCount,
    recommendations,
  };
}

// ─── SH4. Strategy Output Guardrail ────────────────────────────────────────
export interface StrategyGuardrailResult {
  approved: boolean;
  flagForReview: boolean;
  confidence: number;
  reason: string;
  recommendations: string[];
}

export function evaluateStrategyGuardrail(
  confidence: number,
  evidenceCount: number,
  patternConfidence: number
): StrategyGuardrailResult {
  const recommendations: string[] = [];

  if (confidence < 60) {
    recommendations.push('Gather additional evidence to increase confidence above 60%');
    if (evidenceCount < 5) recommendations.push(`Only ${evidenceCount} evidence items — add more supporting documents`);
    if (patternConfidence < 50) recommendations.push('Pattern confidence is low — verify pattern detection results');
    return {
      approved: false,
      flagForReview: true,
      confidence,
      reason: `Strategy confidence (${confidence}%) is below the 60% threshold. Flagged for manual review.`,
      recommendations,
    };
  }

  return {
    approved: true,
    flagForReview: false,
    confidence,
    reason: `Strategy confidence (${confidence}%) meets the threshold.`,
    recommendations: [],
  };
}

// ─── SH5. Remedy Generator Guardrail ────────────────────────────────────────
export interface RemedyGuardrailResult {
  canGenerate: boolean;
  estimateOnly: boolean;
  missingInputs: string[];
  reason: string;
}

export function evaluateRemedyGuardrail(
  claimType: string,
  variables: Record<string, number>,
  jurisdiction: string
): RemedyGuardrailResult {
  const missingInputs: string[] = [];

  // Check critical inputs per claim type
  const criticalInputs: Record<string, string[]> = {
    wage_theft: ['unpaid_wages'],
    housing_discrimination: ['monthly_rent'],
    consumer_fraud: ['amount_paid'],
    debt_harassment: ['violations_count'],
    security_deposit: ['deposit_amount'],
    ssdi_denial: ['monthly_benefit'],
    habitability: ['monthly_rent'],
    overtime_violation: ['overtime_hours', 'regular_rate'],
    public_records: ['request_count'],
  };

  const required = criticalInputs[claimType] || [];
  for (const input of required) {
    if (!variables[input] || variables[input] <= 0) {
      missingInputs.push(input);
    }
  }

  if (!jurisdiction) {
    missingInputs.push('jurisdiction');
  }

  if (missingInputs.length > 0) {
    return {
      canGenerate: true,
      estimateOnly: true,
      missingInputs,
      reason: `Critical inputs missing: ${missingInputs.join(', ')}. Results are estimate-only. No auto-generation of submission documents.`,
    };
  }

  return {
    canGenerate: true,
    estimateOnly: false,
    missingInputs: [],
    reason: 'All critical inputs provided. Full document generation available.',
  };
}

// ─── SH6. Workflow Progress Summary ─────────────────────────────────────────
export interface WorkflowProgress {
  stages: {
    id: string;
    label: string;
    completed: boolean;
    blocked: boolean;
    blockedReason?: string;
  }[];
  currentStage: string;
  completedCount: number;
  totalStages: number;
  percentComplete: number;
}

const WORKFLOW_STAGES = [
  { id: 'pattern_detected', label: 'Pattern Detection' },
  { id: 'pattern_linked', label: 'Pattern Linked' },
  { id: 'strategy_generated', label: 'Strategy Generated' },
  { id: 'strategy_approved', label: 'Strategy Approved' },
  { id: 'remedy_activated', label: 'Remedy Activated' },
  { id: 'documents_generated', label: 'Documents Generated' },
  { id: 'submission_sent', label: 'Submission Sent' },
  { id: 'outcome_recorded', label: 'Outcome Recorded' },
  { id: 'learning_applied', label: 'Learning Applied' },
];

export async function getWorkflowProgress(caseId: number): Promise<WorkflowProgress> {
  const [rows] = await db.execute(sql`
    SELECT * FROM case_workflow_state WHERE case_id = ${caseId}
  `);
  const ws = (rows as unknown as any[])[0];

  if (!ws) {
    return {
      stages: WORKFLOW_STAGES.map(s => ({ ...s, completed: false, blocked: false })),
      currentStage: 'intake',
      completedCount: 0,
      totalStages: WORKFLOW_STAGES.length,
      percentComplete: 0,
    };
  }

  const stages = WORKFLOW_STAGES.map(s => ({
    ...s,
    completed: !!ws[s.id],
    blocked: ws.blocked_stage === s.id,
    blockedReason: ws.blocked_stage === s.id ? ws.blocked_reason : undefined,
  }));

  const completedCount = stages.filter(s => s.completed).length;

  return {
    stages,
    currentStage: ws.current_stage,
    completedCount,
    totalStages: WORKFLOW_STAGES.length,
    percentComplete: Math.round((completedCount / WORKFLOW_STAGES.length) * 100),
  };
}

function parseJson(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
