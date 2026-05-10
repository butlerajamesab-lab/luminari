export interface CaseExportPayload {
  core_state?: Record<string, any>;
  source_facts?: {
    evidence_count?: number;
    finding_items?: Array<Record<string, any>>;
    [key: string]: any;
  };
  coverage?: {
    overall?: number;
    percentage?: number;
    [key: string]: any;
  };
  traceability?: Record<string, any>;
  [key: string]: any;
}

export interface ReadinessMetrics {
  evidence_count: number;
  high_confidence_signals: number;
  coverage_score: number;
  missing_critical_fields: string[];
}

export interface ReadinessResult {
  ready_for_review: boolean;
  reasons: string[];
  metrics: ReadinessMetrics;
}

const CRITICAL_FIELDS = [
  "core_state.record_id",
  "core_state.problem_type",
  "core_state.jurisdiction",
  "core_state.system_primary",
  "core_state.friction.coefficient",
  "traceability.fact_hash.hash",
  "traceability.export_id",
] as const;

function getNestedValue(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function findMissingCriticalFields(payload: CaseExportPayload): string[] {
  const missing: string[] = [];
  for (const field of CRITICAL_FIELDS) {
    const value = getNestedValue(payload, field);
    if (value === null || value === undefined || value === "" || value === "UNKNOWN") {
      missing.push(field);
    }
  }
  return missing;
}

function countHighConfidenceSignals(payload: CaseExportPayload): number {
  const findingItems = payload.source_facts?.finding_items ?? [];
  return findingItems.filter(finding => {
    const confidence = typeof finding.confidence === "number" ? finding.confidence : Number.parseFloat(String(finding.confidence));
    return Number.isFinite(confidence) && confidence >= 0.8;
  }).length;
}

export function computeReadiness(payload: CaseExportPayload): ReadinessResult {
  const evidenceCount = payload.source_facts?.evidence_count ?? 0;
  const highConfidenceSignals = countHighConfidenceSignals(payload);
  const coverageScore = payload.coverage?.overall ?? payload.coverage?.percentage ?? 0;
  const normalizedCoverage = coverageScore > 1 ? coverageScore / 100 : coverageScore;
  const missingCriticalFields = findMissingCriticalFields(payload);

  const metrics: ReadinessMetrics = {
    evidence_count: evidenceCount,
    high_confidence_signals: highConfidenceSignals,
    coverage_score: normalizedCoverage,
    missing_critical_fields: missingCriticalFields,
  };

  const reasons: string[] = [];
  if (evidenceCount < 3) reasons.push(`Evidence count is ${evidenceCount}, minimum required is 3`);
  if (highConfidenceSignals < 1) reasons.push("No high-confidence signals found (need >= 1 finding with confidence >= 0.8)");
  if (normalizedCoverage < 0.7) reasons.push(`Coverage score is ${(normalizedCoverage * 100).toFixed(1)}%, minimum required is 70%`);
  if (missingCriticalFields.length > 0) reasons.push(`Missing critical fields: ${missingCriticalFields.join(", ")}`);

  return {
    ready_for_review: evidenceCount >= 3 && highConfidenceSignals >= 1 && normalizedCoverage >= 0.7 && missingCriticalFields.length === 0,
    reasons,
    metrics,
  };
}
