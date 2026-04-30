/**
 * Transition Constraint Layer — Section 11
 * 
 * Enforces valid state transitions for all pipeline entities.
 * No entity may skip a required state or transition backward
 * without explicit override from sovereign control.
 * 
 * This layer sits between the write contract (finalizePipelineRun)
 * and the actual DB writes. Every state change must pass through here.
 */

// ── Valid state machines ──────────────────────────────────────────────

/** Pipeline run lifecycle */
const PIPELINE_STATES = ["pending", "running", "completed", "failed", "cancelled"] as const;
type PipelineState = typeof PIPELINE_STATES[number];

const PIPELINE_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [], // terminal
  failed: ["pending"], // retry allowed
  cancelled: ["pending"], // restart allowed
};

/** Signal lifecycle: live → gate → detected → acknowledged */
const SIGNAL_STATES = ["live", "gated", "detected", "acknowledged", "dismissed"] as const;
type SignalState = typeof SIGNAL_STATES[number];

const SIGNAL_TRANSITIONS: Record<SignalState, SignalState[]> = {
  live: ["gated", "dismissed"],
  gated: ["detected", "dismissed"],
  detected: ["acknowledged", "dismissed"],
  acknowledged: [], // terminal
  dismissed: [], // terminal
};

/** Ingestion lifecycle */
const INGEST_STATES = ["started", "processing", "completed", "failed"] as const;
type IngestState = typeof INGEST_STATES[number];

const INGEST_TRANSITIONS: Record<IngestState, IngestState[]> = {
  started: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [], // terminal
  failed: ["started"], // retry
};

// ── Constraint validation ─────────────────────────────────────────────

export interface TransitionRequest {
  entityType: "pipeline" | "signal" | "ingest";
  entityId: string | number;
  currentState: string;
  targetState: string;
  reason?: string;
  sovereignOverride?: boolean;
}

export interface TransitionResult {
  allowed: boolean;
  entityType: string;
  entityId: string | number;
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

/**
 * Validate a state transition request.
 * Returns { allowed: true } if the transition is valid,
 * or { allowed: false, reason } if blocked.
 */
export function validateTransition(req: TransitionRequest): TransitionResult {
  const timestamp = Date.now();
  const base = {
    entityType: req.entityType,
    entityId: req.entityId,
    from: req.currentState,
    to: req.targetState,
    timestamp,
  };

  // Sovereign override bypasses all constraints
  if (req.sovereignOverride) {
    return { ...base, allowed: true, reason: "Sovereign override applied" };
  }

  let transitions: Record<string, string[]>;
  switch (req.entityType) {
    case "pipeline":
      transitions = PIPELINE_TRANSITIONS;
      break;
    case "signal":
      transitions = SIGNAL_TRANSITIONS;
      break;
    case "ingest":
      transitions = INGEST_TRANSITIONS;
      break;
    default:
      return { ...base, allowed: false, reason: `Unknown entity type: ${req.entityType}` };
  }

  const validTargets = transitions[req.currentState];
  if (!validTargets) {
    return { ...base, allowed: false, reason: `Unknown current state: ${req.currentState}` };
  }

  if (!validTargets.includes(req.targetState)) {
    return {
      ...base,
      allowed: false,
      reason: `Transition ${req.currentState} → ${req.targetState} is not allowed. Valid targets: [${validTargets.join(", ")}]`,
    };
  }

  return { ...base, allowed: true, reason: "Valid transition" };
}

/**
 * Batch validate multiple transitions.
 * Returns all results — caller decides whether to proceed if any fail.
 */
export function validateTransitionBatch(requests: TransitionRequest[]): TransitionResult[] {
  return requests.map(validateTransition);
}

/**
 * Get the valid next states for a given entity type and current state.
 */
export function getValidNextStates(entityType: "pipeline" | "signal" | "ingest", currentState: string): string[] {
  let transitions: Record<string, string[]>;
  switch (entityType) {
    case "pipeline": transitions = PIPELINE_TRANSITIONS; break;
    case "signal": transitions = SIGNAL_TRANSITIONS; break;
    case "ingest": transitions = INGEST_TRANSITIONS; break;
    default: return [];
  }
  return transitions[currentState] || [];
}

/**
 * Check if a state is terminal (no further transitions possible).
 */
export function isTerminalState(entityType: "pipeline" | "signal" | "ingest", state: string): boolean {
  return getValidNextStates(entityType, state).length === 0;
}

/**
 * Get the full state machine definition for an entity type.
 */
export function getStateMachine(entityType: "pipeline" | "signal" | "ingest") {
  switch (entityType) {
    case "pipeline": return { states: [...PIPELINE_STATES], transitions: { ...PIPELINE_TRANSITIONS } };
    case "signal": return { states: [...SIGNAL_STATES], transitions: { ...SIGNAL_TRANSITIONS } };
    case "ingest": return { states: [...INGEST_STATES], transitions: { ...INGEST_TRANSITIONS } };
  }
}



// ============================================================
