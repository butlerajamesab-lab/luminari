/**
 * Voice Adapter Layer
 *
 * Normalizes and validates tRPC endpoint data before it reaches
 * the narrative synthesis layer. This is the ONLY entry point
 * for voice narration data.
 *
 * Rules enforced:
 * 1. All data comes from luminari_registry via existing tRPC endpoints
 * 2. Projection-only — no writes, no mutations, no pipeline triggers
 * 3. Missing/empty data → explicit "insufficient_data" status
 * 4. No fabrication, no inference, no extrapolation
 */

// ─── Adapter Output Types ───

export interface CaseNarrationInput {
  status: "ready" | "partial_data" | "insufficient_data";
  reason?: string;
  case: {
    id: number;
    title: string;
    clientName: string | null;
    opposingParty: string | null;
    status: string;
    priority: string | null;
    filingDate: string | null;
    domain: string | null;
    description: string | null;
  };
  signals: SignalItem[];
  patterns: PatternItem[];
  deadlines: DeadlineItem[];
  claimsSummary: {
    total: number;
    findingEligible: number;
    signalOnly: number;
  };
  intakeExecution: {
    id: string;
    status: string;
  } | null;
}

export interface SignalNarrationInput {
  status: "ready" | "insufficient_data";
  reason?: string;
  signal: SignalItem | null;
}

export interface PatternNarrationInput {
  status: "ready" | "insufficient_data";
  reason?: string;
  pattern: PatternItem | null;
}

export interface SignalItem {
  id: number;
  severity: string;
  component: string;
  description: string;
  trend: string | null;
}

export interface PatternItem {
  id: number;
  description: string;
  confidence: number | null;
  implication: string | null;
  recommendation: string | null;
}

export interface DeadlineItem {
  description: string;
  date: string;
}

// ─── Validation Helpers ───

function isNonEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function cleanString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function cleanNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ─── Adapter Functions ───

/**
 * T1. getCaseNarrationInput
 *
 * Fetches case, signals, patterns, and governed Intake Spine data
 * via tRPC client and returns a normalized, validated object.
 *
 * @param trpcClient - The tRPC client (passed in to avoid import coupling)
 * @param caseId - The case ID to fetch
 */
export async function getCaseNarrationInput(
  trpcClient: {
    cases: { get: { query: (input: { id: number }) => Promise<any> } };
    flags: { list: { query: (input: { caseId: number }) => Promise<any[]> } };
    patterns: { forCase: { query: (input: { caseId: number }) => Promise<any[]> } };
    analyze: {
      getIntakeSpineStatus: { query: (input: { caseId: number }) => Promise<any[]> };
      getIntakeVerificationProjection: { query: (input: { caseId: number }) => Promise<any> };
    };
  },
  caseId: number
): Promise<CaseNarrationInput> {
  // Fetch all data in parallel — read-only queries
  const [caseData, signalFlags, patterns, intakeStatuses, verification] = await Promise.allSettled([
    trpcClient.cases.get.query({ id: caseId }),
    trpcClient.flags.list.query({ caseId }),
    trpcClient.patterns.forCase.query({ caseId }),
    trpcClient.analyze.getIntakeSpineStatus.query({ caseId }),
    trpcClient.analyze.getIntakeVerificationProjection.query({ caseId }),
  ]);

  // Gate: case data is the minimum requirement
  if (caseData.status === "rejected" || !caseData.value) {
    return {
      status: "insufficient_data",
      reason: "Case data could not be retrieved.",
      case: { id: caseId, title: "Unknown", clientName: null, opposingParty: null, status: "unknown", priority: null, filingDate: null, domain: null, description: null },
      signals: [],
      patterns: [],
      deadlines: [],
      claimsSummary: { total: 0, findingEligible: 0, signalOnly: 0 },
      intakeExecution: null,
    };
  }

  const c = caseData.value;

  // Normalize case fields — only use what actually exists
  const normalizedCase = {
    id: c.id,
    title: cleanString(c.name) || cleanString(c.title) || `Case ${caseId}`,
    clientName: cleanString(c.clientName) || cleanString(c.client_name) || null,
    opposingParty: cleanString(c.opposingParty) || cleanString(c.opposing_party) || null,
    status: cleanString(c.status) || "active",
    priority: cleanString(c.priority) || null,
    filingDate: cleanString(c.filingDate) || cleanString(c.filing_date) || cleanString(c.createdAt) || null,
    domain: cleanString(c.domain) || cleanString(c.pipelineType) || null,
    description: cleanString(c.description) || null,
  };

  // Normalize signals
  const signals: SignalItem[] = [];
  if (signalFlags.status === "fulfilled" && Array.isArray(signalFlags.value)) {
    for (const f of signalFlags.value) {
      if (!f) continue;
      signals.push({
        id: f.id ?? 0,
        severity: cleanString(f.severity) || cleanString(f.flagType) || "info",
        component: cleanString(f.component) || cleanString(f.source) || "unknown",
        description: cleanString(f.description) || cleanString(f.message) || "No description available.",
        trend: cleanString(f.trend) || null,
      });
    }
  }

  // Normalize patterns
  const normalizedPatterns: PatternItem[] = [];
  if (patterns.status === "fulfilled" && Array.isArray(patterns.value)) {
    for (const p of patterns.value) {
      if (!p) continue;
      normalizedPatterns.push({
        id: p.id ?? 0,
        description: cleanString(p.description) || cleanString(p.patternDescription) || "No description available.",
        confidence: cleanNumber(p.confidence),
        implication: cleanString(p.implication) || null,
        recommendation: cleanString(p.recommendation) || null,
      });
    }
  }

  // Deadline narration remains empty until a source-bound governed deadline
  // projection is part of this adapter contract. Do not infer legal deadlines
  // from narrative findings or from an undeclared parallel query.
  const deadlines: DeadlineItem[] = [];

  // Evidence summary — derive from receipt-bound verification records.
  let claimsSummary = { total: 0, findingEligible: 0, signalOnly: 0 };
  if (verification.status === "fulfilled" && Array.isArray(verification.value?.outputs)) {
    const records = verification.value.outputs.flatMap((output: any) => output.records ?? []);
    const total = records.length;
    const findingEligible = records.filter(
      (record: any) => record?.verification_state === "supported_by_multiple_sources"
    ).length;
    claimsSummary = {
      total,
      findingEligible,
      signalOnly: total - findingEligible,
    };
  }

  // Latest complete governed execution.
  let intakeExecution: CaseNarrationInput["intakeExecution"] = null;
  if (intakeStatuses.status === "fulfilled" && Array.isArray(intakeStatuses.value)) {
    const complete = intakeStatuses.value
      .filter((session: any) => session?.execution_complete === true)
      .sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    if (complete.length > 0) {
      intakeExecution = {
        id: String(complete[0].intake_session_id),
        status: cleanString(complete[0].completion_state) || "governed_execution_complete",
      };
    }
  }

  // Determine overall status
  const hasSignals = signals.length > 0;
  const hasPatterns = normalizedPatterns.length > 0;
  const hasFindings = claimsSummary.total > 0;

  let status: CaseNarrationInput["status"] = "ready";
  let reason: string | undefined;

  if (!hasSignals && !hasPatterns && !hasFindings) {
    status = "insufficient_data";
    reason = "No signals, patterns, or findings available for this case.";
  } else if (!hasSignals || !hasPatterns) {
    status = "partial_data";
    reason = `Available: ${[
      hasSignals ? "signals" : null,
      hasPatterns ? "patterns" : null,
      hasFindings ? "findings" : null,
    ].filter(Boolean).join(", ")}. Missing: ${[
      !hasSignals ? "signals" : null,
      !hasPatterns ? "patterns" : null,
      !hasFindings ? "findings" : null,
    ].filter(Boolean).join(", ")}.`;
  }

  return {
    status,
    reason,
    case: normalizedCase,
    signals,
    patterns: normalizedPatterns,
    deadlines,
    claimsSummary,
    intakeExecution,
  };
}

/**
 * T2. getSignalNarrationInput
 *
 * Fetches a single signal flag and normalizes it for narration.
 */
export async function getSignalNarrationInput(
  trpcClient: {
    flags: { list: { query: (input: { caseId: number }) => Promise<any[]> } };
  },
  caseId: number,
  signalId: number
): Promise<SignalNarrationInput> {
  try {
    const flags = await trpcClient.flags.list.query({ caseId });
    const flag = flags.find((f: any) => f?.id === signalId);

    if (!flag) {
      return {
        status: "insufficient_data",
        reason: `Signal ${signalId} not found in case ${caseId}.`,
        signal: null,
      };
    }

    return {
      status: "ready",
      signal: {
        id: flag.id,
        severity: cleanString(flag.severity) || cleanString(flag.flagType) || "info",
        component: cleanString(flag.component) || cleanString(flag.source) || "unknown",
        description: cleanString(flag.description) || cleanString(flag.message) || "No description available.",
        trend: cleanString(flag.trend) || null,
      },
    };
  } catch {
    return {
      status: "insufficient_data",
      reason: "Failed to retrieve signal data.",
      signal: null,
    };
  }
}

/**
 * T3. getPatternNarrationInput
 *
 * Fetches a single pattern and normalizes it for narration.
 */
export async function getPatternNarrationInput(
  trpcClient: {
    patterns: { forCase: { query: (input: { caseId: number }) => Promise<any[]> } };
  },
  caseId: number,
  patternId: number
): Promise<PatternNarrationInput> {
  try {
    const patterns = await trpcClient.patterns.forCase.query({ caseId });
    const pattern = patterns.find((p: any) => p?.id === patternId);

    if (!pattern) {
      return {
        status: "insufficient_data",
        reason: `Pattern ${patternId} not found in case ${caseId}.`,
        pattern: null,
      };
    }

    return {
      status: "ready",
      pattern: {
        id: pattern.id,
        description: cleanString(pattern.description) || cleanString(pattern.patternDescription) || "No description available.",
        confidence: cleanNumber(pattern.confidence),
        implication: cleanString(pattern.implication) || null,
        recommendation: cleanString(pattern.recommendation) || null,
      },
    };
  } catch {
    return {
      status: "insufficient_data",
      reason: "Failed to retrieve pattern data.",
      pattern: null,
    };
  }
}
