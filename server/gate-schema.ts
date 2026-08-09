/**
 * Deterministic Gate Schema — Structural Completion Pass
 *
 * Single authoritative module defining:
 *  1. GateStage enum — canonical snapshot stage states
 *  2. computeGateStage() — deterministic stage evaluator
 *  3. assertAllowed() — action permission matrix gatekeeper
 *  4. assertWorkerScoped() — worker boundary enforcement
 *
 * No feature expansion. No prompt/correlation/findings/signing changes.
 * This is the system's portability contract for Spine migration.
 */

// ─── 1. GateStage Enum ──────────────────────────────────────────────────────

export const GATE_STAGES = [
  'EXTRACTION',
  'CLAIM_BUILD',
  'CORRELATION',
  'FINDINGS',
  'READY_TO_SEAL',
  'SEALED',
] as const;

export type GateStage = typeof GATE_STAGES[number];

// ─── 2. Stage Completion Criteria ────────────────────────────────────────────

/**
 * Inputs required to compute the current gate stage.
 * All counts are snapshot-scoped (not case-wide).
 */
export interface GateStageInput {
  snapshotStatus: 'open' | 'sealed';

  // Extraction metrics (snapshot-scoped document counts)
  totalDocuments: number;
  readyDocuments: number;
  extractingDocuments: number;  // status IN ('extracting', 'analyzing', 'retrying')
  errorDocuments: number;       // status IN ('error', 'failed_permanent')

  // Granular extraction integrity counts (all must be 0 for integrity = true)
  uploadedCount: number;          // status = 'uploaded' (not yet started)
  extractingCount: number;        // status = 'extracting'
  analyzingCount: number;         // status = 'analyzing'
  retryingCount: number;          // status = 'retrying'
  autoRecoverableCount: number;   // classified as auto-recoverable by remediation classifier
  manualReuploadCount: number;    // classified as manual re-upload required
  failedPermanentCount: number;   // status = 'failed_permanent'

  // Claim build metrics
  totalClaims: number;

  // Correlation metrics
  totalCorrelations: number;
  correlationRunCompleted: boolean;  // true if a correlation run has been recorded for this snapshotId

  // Findings metrics
  totalFindings: number;
  findingsRunCompleted: boolean;  // true if a findings run has been recorded for this snapshotId

  // Worker state
  activeWorkerJobs: number;  // jobs currently in-flight for this snapshotId
  isQueueProcessing: boolean;  // queue has items being processed
}

/**
 * Result of stage computation. Contains the current stage and per-stage
 * completion status for UI rendering.
 */
export interface GateStageResult {
  currentStage: GateStage;
  extractionIntegrity: boolean;  // true only when all integrity fields are 0
  stages: {
    EXTRACTION: StageStatus;
    CLAIM_BUILD: StageStatus;
    CORRELATION: StageStatus;
    FINDINGS: StageStatus;
    READY_TO_SEAL: StageStatus;
  };
  canSeal: boolean;
}

export interface StageStatus {
  complete: boolean;
  running: boolean;
  blocked: boolean;
  reason: string;
}

/**
 * T0. Extraction Integrity Check.
 *
 * Extraction integrity = TRUE only when ALL of the following are 0:
 *   extractingCount, analyzingCount, retryingCount, uploadedCount,
 *   autoRecoverableCount, manualReuploadCount
 *
 * Additionally: failedPermanentCount must equal manualReuploadCount
 * (no hidden category leakage).
 *
 * If ANY > 0: GateStage = EXTRACTION. No downstream stage advancement.
 */
export function isExtractionIntegrityComplete(input: GateStageInput): boolean {
  return (
    input.extractingCount === 0 &&
    input.analyzingCount === 0 &&
    input.retryingCount === 0 &&
    input.uploadedCount === 0 &&
    input.autoRecoverableCount === 0 &&
    input.manualReuploadCount === 0 &&
    input.failedPermanentCount === input.manualReuploadCount // both must be 0 (no leakage)
  );
}

/**
 * T1. Compute the current gate stage from snapshot-scoped metrics.
 *
 * Evaluation order is strictly serial:
 *   T1a. SEALED is terminal — returned immediately.
 *   T1b. Extraction integrity guard — if integrity is incomplete, stage = EXTRACTION.
 *        No downstream advancement allowed regardless of claim/correlation/findings state.
 *   T1c. Sequential stage evaluation — CLAIM_BUILD → CORRELATION → FINDINGS → READY_TO_SEAL.
 *
 * This enforces serial integrity: you cannot partially build claims while retrying extraction,
 * you cannot correlate early, you cannot parallel-push downstream stages.
 */
export function computeGateStage(input: GateStageInput): GateStageResult {
  // Terminal state: SEALED snapshots have no active stage
  if (input.snapshotStatus === 'sealed') {
    return {
      currentStage: 'SEALED',
      extractionIntegrity: true,
      stages: {
        EXTRACTION: { complete: true, running: false, blocked: false, reason: 'Snapshot sealed' },
        CLAIM_BUILD: { complete: true, running: false, blocked: false, reason: 'Snapshot sealed' },
        CORRELATION: { complete: true, running: false, blocked: false, reason: 'Snapshot sealed' },
        FINDINGS: { complete: true, running: false, blocked: false, reason: 'Snapshot sealed' },
        READY_TO_SEAL: { complete: true, running: false, blocked: false, reason: 'Snapshot sealed' },
      },
      canSeal: false,
    };
  }

  // ── T1b. EXTRACTION INTEGRITY GUARD ──
  const integrityComplete = isExtractionIntegrityComplete(input);

  // Activity complete = no workers running, no queue processing
  const extractionActivityComplete =
    input.totalDocuments > 0 &&
    input.extractingDocuments === 0 &&
    !input.isQueueProcessing;

  // Full extraction complete = activity done AND integrity clean
  const extractionComplete = extractionActivityComplete && integrityComplete;

  const extractionRunning =
    input.extractingDocuments > 0 || input.isQueueProcessing;

  // Build integrity detail string for UI
  const integrityDetails: string[] = [];
  if (input.autoRecoverableCount > 0) integrityDetails.push(`${input.autoRecoverableCount} auto-recoverable`);
  if (input.manualReuploadCount > 0) integrityDetails.push(`${input.manualReuploadCount} manual re-upload`);
  if (input.uploadedCount > 0) integrityDetails.push(`${input.uploadedCount} uploaded (pending)`);
  if (input.extractingCount > 0) integrityDetails.push(`${input.extractingCount} extracting`);
  if (input.analyzingCount > 0) integrityDetails.push(`${input.analyzingCount} analyzing`);
  if (input.retryingCount > 0) integrityDetails.push(`${input.retryingCount} retrying`);

  const extractionStatus: StageStatus = {
    complete: extractionComplete,
    running: extractionRunning,
    blocked: (input.totalDocuments === 0) || (!integrityComplete && extractionActivityComplete),  // no docs OR activity done but integrity incomplete
    reason: input.totalDocuments === 0
      ? 'No documents uploaded'
      : extractionComplete
        ? `${input.readyDocuments} ready, extraction integrity verified`
        : extractionRunning
          ? `${input.extractingDocuments} in progress`
          : !integrityComplete && extractionActivityComplete
            ? `Extraction complete (activity). Integrity incomplete: ${integrityDetails.join(', ')}`
            : 'Waiting for extraction',
  };

  // ── CLAIM_BUILD ──
  // Complete when: extraction complete (with integrity) AND claims > 0
  const claimBuildComplete = extractionComplete && input.totalClaims > 0;
  const claimBuildRunning = extractionComplete && input.totalClaims === 0;
  const claimBuildBlocked = !extractionComplete;

  const claimBuildStatus: StageStatus = {
    complete: claimBuildComplete,
    running: claimBuildRunning && !claimBuildBlocked,
    blocked: claimBuildBlocked,
    reason: claimBuildBlocked
      ? !integrityComplete
        ? 'Blocked by extraction integrity'
        : 'Waiting for extraction'
      : claimBuildComplete
        ? `${input.totalClaims} claims`
        : 'Claim build pending',
  };

  // ── CORRELATION ──
  const correlationComplete = claimBuildComplete && input.correlationRunCompleted && input.totalCorrelations > 0;
  const correlationRunning = claimBuildComplete && !input.correlationRunCompleted && input.totalCorrelations === 0;
  const correlationBlocked = !claimBuildComplete;

  const correlationStatus: StageStatus = {
    complete: correlationComplete,
    running: correlationRunning && !correlationBlocked,
    blocked: correlationBlocked,
    reason: correlationBlocked
      ? !integrityComplete
        ? 'Blocked by extraction integrity'
        : 'Waiting for claim build'
      : correlationComplete
        ? `${input.totalCorrelations} correlations`
        : 'Correlation pending',
  };

  // ── FINDINGS ──
  const findingsComplete = correlationComplete && input.findingsRunCompleted && input.totalFindings > 0;
  const findingsRunning = correlationComplete && !input.findingsRunCompleted && input.totalFindings === 0;
  const findingsBlocked = !correlationComplete;

  const findingsStatus: StageStatus = {
    complete: findingsComplete,
    running: findingsRunning && !findingsBlocked,
    blocked: findingsBlocked,
    reason: findingsBlocked
      ? !integrityComplete
        ? 'Blocked by extraction integrity'
        : 'Waiting for correlation'
      : findingsComplete
        ? `${input.totalFindings} findings`
        : 'Findings pending',
  };

  // ── READY_TO_SEAL ──
  const readyToSeal =
    extractionComplete &&
    claimBuildComplete &&
    correlationComplete &&
    findingsComplete &&
    input.activeWorkerJobs === 0;

  const readyToSealStatus: StageStatus = {
    complete: readyToSeal,
    running: false,
    blocked: !findingsComplete,
    reason: readyToSeal
      ? 'All stages complete — ready to seal'
      : input.activeWorkerJobs > 0
        ? `${input.activeWorkerJobs} worker jobs still active`
        : !integrityComplete
          ? 'Blocked by extraction integrity'
          : 'Prerequisite stages incomplete',
  };

  // Determine current stage (first incomplete stage in sequence)
  // Extraction integrity guard: if integrity incomplete, stage = EXTRACTION regardless
  let currentStage: GateStage;
  if (!extractionComplete) currentStage = 'EXTRACTION';
  else if (!claimBuildComplete) currentStage = 'CLAIM_BUILD';
  else if (!correlationComplete) currentStage = 'CORRELATION';
  else if (!findingsComplete) currentStage = 'FINDINGS';
  else currentStage = 'READY_TO_SEAL';

  return {
    currentStage,
    extractionIntegrity: integrityComplete,
    stages: {
      EXTRACTION: extractionStatus,
      CLAIM_BUILD: claimBuildStatus,
      CORRELATION: correlationStatus,
      FINDINGS: findingsStatus,
      READY_TO_SEAL: readyToSealStatus,
    },
    canSeal: readyToSeal,
  };
}

// ─── 3. Action Permission Matrix ─────────────────────────────────────────────

/**
 * All gated actions in the system. Each action has rules governing
 * which snapshot states and gate stages permit it.
 */
export const GATED_ACTIONS = [
  'runCorrelation',
  'runFindings',
  'sealSnapshot',
  'export',
  'runProvenanceDrilldown',
  'runPhase2Analysis',
  'runCDA',
] as const;

export type GatedAction = typeof GATED_ACTIONS[number];

/**
 * Permission rule for a single action.
 */
interface ActionPermission {
  /** Snapshot statuses that permit this action */
  allowedStatuses: Array<'open' | 'sealed'>;
  /** Gate stages that permit this action (null = any stage) */
  allowedStages: GateStage[] | null;
  /** Human-readable description of the permission rule */
  description: string;
}

/**
 * The authoritative permission matrix. Each action maps to its rules.
 *
 * Rules:
 *  - Any mutation action requires OPEN snapshot.
 *  - Any stage action must match its gate stage.
 *  - sealSnapshot allowed only at READY_TO_SEAL.
 *  - export allowed always, but SEALED exports must be signature-verifiable.
 *  - Provenance drill-down mutations require SEALED snapshot.
 *  - Phase-2 analysis requires SEALED snapshot.
 *  - CDA is independent of snapshot stage (operates on document text).
 */
const PERMISSION_MATRIX: Record<GatedAction, ActionPermission> = {
  runCorrelation: {
    allowedStatuses: ['open'],
    allowedStages: ['CORRELATION', 'READY_TO_SEAL'],
    description: 'Execute cross-document correlation pass. Requires open snapshot at CORRELATION or READY_TO_SEAL stage.',
  },
  runFindings: {
    allowedStatuses: ['open'],
    allowedStages: ['FINDINGS', 'READY_TO_SEAL'],
    description: 'Execute findings synthesis pass. Requires open snapshot at FINDINGS or READY_TO_SEAL stage.',
  },
  sealSnapshot: {
    allowedStatuses: ['open'],
    allowedStages: ['READY_TO_SEAL'],
    description: 'Seal the snapshot. Requires open snapshot with all stages complete and no active workers.',
  },
  export: {
    allowedStatuses: ['open', 'sealed'],
    allowedStages: null,
    description: 'Export snapshot data. Allowed in any state. SEALED exports include signature verification.',
  },
  runProvenanceDrilldown: {
    allowedStatuses: ['sealed'],
    allowedStages: ['SEALED'],
    description: 'Run provenance drill-down mutations (re-matching, synthesis marking). Requires sealed snapshot.',
  },
  runPhase2Analysis: {
    allowedStatuses: ['sealed'],
    allowedStages: ['SEALED'],
    description: 'Run Phase-2 evidence detection and structured notes. Requires sealed snapshot.',
  },
  runCDA: {
    allowedStatuses: ['open', 'sealed'],
    allowedStages: null,
    description: 'Run Claim Denial Analysis. Independent of snapshot stage — operates on document text.',
  },
};

/**
 * Error codes for gate violations. Consistent across all rejection paths.
 */
export const GATE_ERROR_CODES = {
  SNAPSHOT_SEALED: 'GATE_SNAPSHOT_SEALED',
  SNAPSHOT_OPEN_REQUIRED: 'GATE_SNAPSHOT_OPEN_REQUIRED',
  SEALED_REQUIRED: 'GATE_SEALED_REQUIRED',
  STAGE_MISMATCH: 'GATE_STAGE_MISMATCH',
  WORKER_UNSCOPED: 'GATE_WORKER_UNSCOPED',
  SEALED_MUTATION: 'GATE_SEALED_MUTATION',
  EXTRACTION_INTEGRITY_INCOMPLETE: 'GATE_EXTRACTION_INTEGRITY_INCOMPLETE',
} as const;

export type GateErrorCode = typeof GATE_ERROR_CODES[keyof typeof GATE_ERROR_CODES];

/**
 * T2. Assert that an action is permitted given the current snapshot state.
 *
 * Throws a structured error with a consistent gate error code if the action
 * is not permitted. Returns void on success.
 *
 * @param action - The gated action to check
 * @param snapshotStatus - Current snapshot status ('open' | 'sealed')
 * @param currentStage - Current gate stage (from computeGateStage)
 */
export function assertAllowed(
  action: GatedAction,
  snapshotStatus: 'open' | 'sealed',
  currentStage: GateStage,
): void {
  const permission = PERMISSION_MATRIX[action];
  if (!permission) {
    throw new GateError(
      'GATE_STAGE_MISMATCH',
      `Unknown gated action: ${action}`,
      action,
      snapshotStatus,
      currentStage,
    );
  }

  // Check snapshot status
  if (!permission.allowedStatuses.includes(snapshotStatus)) {
    if (snapshotStatus === 'sealed' && permission.allowedStatuses.includes('open')) {
      throw new GateError(
        GATE_ERROR_CODES.SNAPSHOT_SEALED,
        `Action "${action}" requires an open snapshot. Current snapshot is sealed. ${permission.description}`,
        action,
        snapshotStatus,
        currentStage,
      );
    }
    if (snapshotStatus === 'open' && permission.allowedStatuses.includes('sealed')) {
      throw new GateError(
        GATE_ERROR_CODES.SEALED_REQUIRED,
        `Action "${action}" requires a sealed snapshot. Current snapshot is open. ${permission.description}`,
        action,
        snapshotStatus,
        currentStage,
      );
    }
  }

  // Check stage (null = any stage allowed)
  if (permission.allowedStages !== null && !permission.allowedStages.includes(currentStage)) {
    throw new GateError(
      GATE_ERROR_CODES.STAGE_MISMATCH,
      `Action "${action}" not permitted at stage ${currentStage}. Allowed stages: ${permission.allowedStages.join(', ')}. ${permission.description}`,
      action,
      snapshotStatus,
      currentStage,
    );
  }
}

/**
 * T3. Check if an action is permitted (non-throwing version for UI state).
 * Returns { allowed: true } or { allowed: false, reason, errorCode }.
 */
export function isAllowed(
  action: GatedAction,
  snapshotStatus: 'open' | 'sealed',
  currentStage: GateStage,
): { allowed: true } | { allowed: false; reason: string; errorCode: GateErrorCode } {
  try {
    assertAllowed(action, snapshotStatus, currentStage);
    return { allowed: true };
  } catch (err) {
    if (err instanceof GateError) {
      return { allowed: false, reason: err.message, errorCode: err.code };
    }
    return { allowed: false, reason: String(err), errorCode: GATE_ERROR_CODES.STAGE_MISMATCH };
  }
}

/**
 * Get the full permission matrix as a serializable table.
 * Used for documentation and UI rendering.
 */
export function getPermissionMatrix(): Array<{
  action: GatedAction;
  allowedStatuses: string[];
  allowedStages: string[] | null;
  description: string;
}> {
  return GATED_ACTIONS.map(action => ({
    action,
    ...PERMISSION_MATRIX[action],
  }));
}

// ─── 4. Worker Boundary Enforcement ──────────────────────────────────────────

/**
 * Worker job scope — all worker jobs must carry these fields.
 */
export interface WorkerJobScope {
  documentId: number;
  caseId: number;
  snapshotId: number;
  laneId: string;
}

/**
 * T4. Assert that a worker job is properly scoped.
 * Rejects unscoped jobs (missing caseId, snapshotId, or laneId).
 */
export function assertWorkerScoped(job: Partial<WorkerJobScope>): asserts job is WorkerJobScope {
  const missing: string[] = [];
  if (!job.documentId || job.documentId <= 0) missing.push('documentId');
  if (!job.caseId || job.caseId <= 0) missing.push('caseId');
  if (!job.snapshotId || job.snapshotId <= 0) missing.push('snapshotId');
  if (!job.laneId || job.laneId.trim() === '') missing.push('laneId');

  if (missing.length > 0) {
    throw new GateError(
      GATE_ERROR_CODES.WORKER_UNSCOPED,
      `Worker job missing required scope fields: ${missing.join(', ')}. All jobs must include documentId, caseId, snapshotId, and laneId.`,
      'runPhase2Analysis',
      'open',
      'EXTRACTION',
    );
  }
}

// ─── 5. Sealed Mutation Guard ────────────────────────────────────────────────

/**
 * T5. Assert that a mutation is permitted on the given snapshot.
 * Rejects all mutations on sealed snapshots with a consistent error code.
 *
 * This is a gate-schema-level guard that wraps the existing assertSnapshotMutable()
 * with consistent error codes for the portability contract.
 */
export function assertMutationAllowed(
  snapshotStatus: 'open' | 'sealed',
  snapshotId: number,
  snapshotVersion: number,
  action: string,
): void {
  if (snapshotStatus === 'sealed') {
    throw new GateError(
      GATE_ERROR_CODES.SEALED_MUTATION,
      `Mutation "${action}" rejected: Snapshot v${snapshotVersion} (ID: ${snapshotId}) is sealed. All mutations on sealed snapshot data are blocked. Create a new snapshot to modify extraction outputs.`,
      action as GatedAction,
      'sealed',
      'SEALED',
    );
  }
}

// ─── Gate Error Class ────────────────────────────────────────────────────────

export class GateError extends Error {
  public readonly code: GateErrorCode;
  public readonly action: string;
  public readonly snapshotStatus: string;
  public readonly currentStage: string;

  constructor(
    code: GateErrorCode,
    message: string,
    action: string,
    snapshotStatus: string,
    currentStage: string,
  ) {
    super(message);
    this.name = 'GateError';
    this.code = code;
    this.action = action;
    this.snapshotStatus = snapshotStatus;
    this.currentStage = currentStage;
  }

  /**
   * Serialize for audit logging.
   */
  toAuditPayload(): Record<string, unknown> {
    return {
      gateErrorCode: this.code,
      action: this.action,
      snapshotStatus: this.snapshotStatus,
      currentStage: this.currentStage,
      message: this.message,
    };
  }
}
