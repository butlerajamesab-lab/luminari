import { z } from "zod";
import {
  canonical_json,
  sha256_hex,
  sign_prism_request,
} from "./prism-verification-contract";
import { PRISM_BASE_URL, PrismBoundaryError } from "./prism-verification-client";

const PRISM_PROBLEM_PATH = "/api/v1/problem-instances";
const PRISM_PROBLEM_TIMEOUT_MS = 5_000;
const PRISM_PROBLEM_MAX_ATTEMPTS = 3;

const prismProblemResponseSchema = z.object({
  schema_version: z.literal("prism-problem-intake-1.0.0"),
  persistence: z.object({
    problem_instance_id: z.string().uuid(),
    normalized_hash: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.string(),
    idempotency_reused: z.boolean(),
  }),
  peer_pool_count: z.number().int().nonnegative(),
  eligible_pair_count: z.number().int().nonnegative(),
  candidate_is_verified_correlation: z.literal(false),
});

export type LighthouseProblemInstanceRow = {
  id: string;
  record_id: string;
  problem_type: "DENIAL" | "ESCALATION" | "GAP" | "CONTRADICTION" | "SIGNAL";
  jurisdiction: string;
  system_primary: string;
  risk_level: string;
  friction: unknown;
  alignment: unknown;
  findings: unknown;
  resolution_pathways: unknown;
  evidence: unknown;
  grounding_entities: unknown;
  actions: unknown;
  feedback_history: unknown;
  traceability: unknown;
  coordination: unknown;
  intake_ready: boolean;
  recommended_next_action: unknown;
  created_at: string | null;
  updated_at: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function optionalIso(value: unknown, fallback: string | null): string | null {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  if (fallback && Number.isFinite(Date.parse(fallback))) return new Date(fallback).toISOString();
  return null;
}

export function buildPrismProblemObservation(row: LighthouseProblemInstanceRow) {
  if (!row.intake_ready) throw new Error("lighthouse_problem_not_intake_ready");

  const traceability = asRecord(row.traceability);
  const coordination = asRecord(row.coordination);
  const jurisdictionContext = asRecord(coordination.jurisdiction_context);
  const crossJurisdiction = asRecord(coordination.cross_jurisdiction);
  const sourceRefs = strings(traceability.source_refs);
  const crossJurisdictions = strings(crossJurisdiction.jurisdictions_involved);
  const systemsInvolved = strings(coordination.systems_involved);
  const blockingEntities = strings(coordination.blocking_entities);
  const dependencies = strings(coordination.dependencies);
  const overrides = strings(jurisdictionContext.overrides);
  const groundingEntities = strings(row.grounding_entities);

  const jurisdictionKeys = [
    row.jurisdiction,
    ...crossJurisdictions,
    typeof jurisdictionContext.level === "string" && typeof jurisdictionContext.name === "string"
      ? `${jurisdictionContext.level}:${jurisdictionContext.name}`
      : "",
  ].filter(Boolean);

  const contextRefs = [
    `system:${row.system_primary}`,
    ...dependencies.map((value) => `dependency:${value}`),
    ...overrides.map((value) => `override:${value}`),
    typeof crossJurisdiction.conflict_type === "string" && crossJurisdiction.conflict_type
      ? `conflict:${crossJurisdiction.conflict_type}`
      : "",
  ].filter(Boolean);

  const snapshot = {
    id: row.id,
    record_id: row.record_id,
    problem_type: row.problem_type,
    jurisdiction: row.jurisdiction,
    system_primary: row.system_primary,
    risk_level: row.risk_level,
    friction: row.friction,
    alignment: row.alignment,
    findings: row.findings,
    resolution_pathways: row.resolution_pathways,
    evidence: row.evidence,
    grounding_entities: row.grounding_entities,
    actions: row.actions,
    feedback_history: row.feedback_history,
    traceability: row.traceability,
    coordination: row.coordination,
    intake_ready: row.intake_ready,
    recommended_next_action: row.recommended_next_action,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const sourceSnapshotHash = sha256_hex(canonical_json(snapshot));

  return {
    observation: {
      origin_system: "LIGHTHOUSE" as const,
      origin_object_id: row.record_id,
      evidence_origin_key: `lighthouse:problem_instance:${row.record_id}`,
      problem_type: row.problem_type,
      jurisdiction: row.jurisdiction,
      jurisdiction_keys: jurisdictionKeys,
      slice_id: row.system_primary,
      risk_level: row.risk_level || null,
      observed_at_start: optionalIso(traceability.created_at, row.created_at),
      observed_at_end: optionalIso(traceability.updated_at, row.updated_at),
      source_validation_state: traceability.validation_status === "VALIDATED" ? "VALIDATED" as const : "UNKNOWN" as const,
      source_authority: "MIXED" as const,
      source_refs: sourceRefs,
      source_snapshot_hash: sourceSnapshotHash,
      institution_refs: [...systemsInvolved, ...blockingEntities],
      workflow_refs: [],
      context_refs: contextRefs,
      population_refs: groundingEntities,
    },
    source_snapshot_hash: sourceSnapshotHash,
  };
}

export async function submitLighthouseProblemToPrism(row: LighthouseProblemInstanceRow) {
  const secret = process.env.PRISM_BRIDGE_SECRET;
  if (!secret) throw new PrismBoundaryError("authentication", 503, "prism_bridge_secret_unconfigured");

  const built = buildPrismProblemObservation(row);
  const body = canonical_json(built.observation);
  let lastError: PrismBoundaryError | null = null;

  for (let attempt = 1; attempt <= PRISM_PROBLEM_MAX_ATTEMPTS; attempt += 1) {
    const timestamp = Date.now().toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRISM_PROBLEM_TIMEOUT_MS);
    try {
      const response = await fetch(`${PRISM_BASE_URL}${PRISM_PROBLEM_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-prism-client": "lighthouse",
          "x-prism-timestamp": timestamp,
          "x-prism-signature": sign_prism_request(secret, timestamp, "POST", PRISM_PROBLEM_PATH, body),
        },
        body,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          ...prismProblemResponseSchema.parse(payload),
          source_snapshot_hash: built.source_snapshot_hash,
          attempts: attempt,
          http_status: response.status,
        };
      }
      const failureClass = response.status === 401 || response.status === 403
        ? "authentication"
        : response.status === 400 || response.status === 422
          ? "validation"
          : response.status === 408 || response.status === 429 || response.status >= 500
            ? "transient_upstream"
            : "permanent_upstream";
      const error = new PrismBoundaryError(failureClass, response.status, typeof (payload as any)?.error === "string" ? (payload as any).error : "prism_problem_intake_failed");
      if (failureClass !== "transient_upstream" || attempt === PRISM_PROBLEM_MAX_ATTEMPTS) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof PrismBoundaryError) {
        if (error.failure_class !== "transient_upstream" || attempt === PRISM_PROBLEM_MAX_ATTEMPTS) throw error;
        lastError = error;
      } else if (error instanceof Error && error.name === "AbortError") {
        lastError = new PrismBoundaryError("timeout", 503, "prism_problem_intake_timed_out");
        if (attempt === PRISM_PROBLEM_MAX_ATTEMPTS) throw lastError;
      } else if (error instanceof Error && error.name === "ZodError") {
        throw new PrismBoundaryError("validation", 502, "invalid_prism_problem_response");
      } else {
        lastError = new PrismBoundaryError("network", 503, "prism_problem_intake_network_failure");
        if (attempt === PRISM_PROBLEM_MAX_ATTEMPTS) throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new PrismBoundaryError("network", 503, "prism_problem_intake_network_failure");
}
