import { listEvents } from "./case-runtime-chronology-compat";
import { getPool } from "./db-legacy";
import { read_case_intake_integrity_projection } from "./intake-case-integrity-projection";
import { read_canonical_case_layer_outputs } from "./intake-case-layer-reader";
import {
  project_case_entities,
  project_case_relationships,
} from "./intake-case-runtime-projection";
import type { VerificationRecord } from "./engines/intake-spine/layer-5-verification_gate";
import type { DetectedPattern } from "./engines/intake-spine/layer-10-pattern_registry";
import type { CascadeChain } from "./engines/intake-spine/layer-11-cascade_registry";
import type { ClaimCandidate } from "./engines/intake-spine/layer-12-rights_and_duties_matrix";
import { isMissingCaseCommitmentRelation } from "./case-commitment-availability";

function output_item_count<T>(outputs: Array<{ data: T[] }>): number {
  return outputs.reduce(
    (total, output) =>
      total + (Array.isArray(output.data) ? output.data.length : 0),
    0,
  );
}

export type CaseCommittedCounts = {
  findings: number;
  barriers: number;
  benefits: number;
  signals: number;
  statutes: number;
  foiaRequests: number;
  filings: number;
};

export type CaseDerivedIntakeCounts = {
  registeredSources: number;
  entities: number;
  events: number;
  relationships: number;
  verificationRecords: number;
  claimCandidates: number;
  structuralSignals: number;
};

type CaseCommitmentProjection = {
  state: "not_projected" | "case_state_projection";
  counts: CaseCommittedCounts;
};

const EMPTY_COMMITTED_COUNTS: CaseCommittedCounts = {
  findings: 0,
  barriers: 0,
  benefits: 0,
  signals: 0,
  statutes: 0,
  foiaRequests: 0,
  filings: 0,
};

function as_count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Case State is the reviewer-authored commitment boundary. Its identifiers are
 * intentionally counted separately from receipt-bound machine projections so
 * verification records and claim candidates cannot be presented as committed
 * findings or claims.
 */
async function read_case_commitment_projection(
  case_id: number,
): Promise<CaseCommitmentProjection> {
  let rows: Array<Record<string, unknown>>;
  try {
    const result = await getPool().query(
      `select
       case when jsonb_typeof(committed_finding_ids) = 'array'
         then jsonb_array_length(committed_finding_ids) else 0 end::int as findings,
       case when jsonb_typeof(committed_barrier_ids) = 'array'
         then jsonb_array_length(committed_barrier_ids) else 0 end::int as barriers,
       case when jsonb_typeof(committed_benefit_ids) = 'array'
         then jsonb_array_length(committed_benefit_ids) else 0 end::int as benefits,
       case when jsonb_typeof(committed_signal_ids) = 'array'
         then jsonb_array_length(committed_signal_ids) else 0 end::int as signals,
       case when jsonb_typeof(committed_statute_ids) = 'array'
         then jsonb_array_length(committed_statute_ids) else 0 end::int as statutes,
       case when jsonb_typeof(committed_foia_ids) = 'array'
         then jsonb_array_length(committed_foia_ids) else 0 end::int as foia_requests,
       case when jsonb_typeof(committed_filing_ids) = 'array'
         then jsonb_array_length(committed_filing_ids) else 0 end::int as filings
     from public.case_state
     where case_id = $1
     limit 1`,
      [case_id],
    ) as unknown as { rows: Array<Record<string, unknown>> };
    rows = result.rows;
  } catch (error) {
    if (isMissingCaseCommitmentRelation(error)) {
      return { state: "not_projected", counts: { ...EMPTY_COMMITTED_COUNTS } };
    }
    throw error;
  }
  const row = rows[0];
  if (!row) {
    return { state: "not_projected", counts: { ...EMPTY_COMMITTED_COUNTS } };
  }
  return {
    state: "case_state_projection",
    counts: {
      findings: as_count(row.findings),
      barriers: as_count(row.barriers),
      benefits: as_count(row.benefits),
      signals: as_count(row.signals),
      statutes: as_count(row.statutes),
      foiaRequests: as_count(row.foia_requests),
      filings: as_count(row.filings),
    },
  };
}

/**
 * One receipt-bound statistics projection for every case summary surface.
 * Legacy analyzer tables are intentionally excluded: an absent governed layer
 * is zero/not-projected, never permission to read a retired parallel runtime.
 */
export async function getCaseStats(caseId: number) {
  const [
    integrity,
    entities,
    relationships,
    events,
    verification,
    claims,
    patterns,
    cascades,
    commitment,
  ] = await Promise.all([
    read_case_intake_integrity_projection(caseId),
    project_case_entities(caseId),
    project_case_relationships(caseId),
    listEvents(caseId),
    read_canonical_case_layer_outputs<VerificationRecord[]>(
      caseId,
      "verification_gate",
    ),
    read_canonical_case_layer_outputs<ClaimCandidate[]>(
      caseId,
      "rights_and_duties_matrix",
    ),
    read_canonical_case_layer_outputs<DetectedPattern[]>(
      caseId,
      "pattern_registry",
    ),
    read_canonical_case_layer_outputs<CascadeChain[]>(
      caseId,
      "cascade_registry",
    ),
    read_case_commitment_projection(caseId),
  ]);

  const documentStatus: Record<string, number> = {};
  for (const artifact of integrity.artifacts) {
    const status =
      artifact.integrity_status ??
      artifact.source_artifact_status ??
      "registered";
    documentStatus[status] = (documentStatus[status] ?? 0) + 1;
  }

  const derivedIntake: CaseDerivedIntakeCounts = {
    registeredSources: integrity.source_artifact_count,
    entities:
      entities.state === "canonical_projection" ? entities.entities.length : 0,
    events: events.length,
    relationships:
      relationships.state === "canonical_projection"
        ? relationships.relationships.length
        : 0,
    verificationRecords:
      verification.state === "canonical_projection"
        ? output_item_count(verification.outputs)
        : 0,
    claimCandidates:
      claims.state === "canonical_projection"
        ? output_item_count(claims.outputs)
        : 0,
    structuralSignals:
      (patterns.state === "canonical_projection"
        ? output_item_count(patterns.outputs)
        : 0) +
      (cascades.state === "canonical_projection"
        ? output_item_count(cascades.outputs)
        : 0),
  };

  return {
    // Backward-compatible aliases for existing summary surfaces. `claims` and
    // `findings` remain candidate/verification counts here; callers that need
    // precise semantics must use `derivedIntake` or `committed` below.
    documents: derivedIntake.registeredSources,
    entities: derivedIntake.entities,
    quotes: 0,
    claims: derivedIntake.claimCandidates,
    findings: derivedIntake.verificationRecords,
    events: derivedIntake.events,
    relationships: derivedIntake.relationships,
    signalFlags: derivedIntake.structuralSignals,
    verificationRecords: derivedIntake.verificationRecords,
    claimCandidates: derivedIntake.claimCandidates,
    committedFindings: commitment.counts.findings,
    derivedIntake,
    committed: commitment.counts,
    documentStatus,
    projectionState: {
      integrity: integrity.projection_state,
      entities: entities.state,
      relationships: relationships.state,
      verification: verification.state,
      claims: claims.state,
      patterns: patterns.state,
      cascades: cascades.state,
      commitments: commitment.state,
    },
    provenance: {
      derivedIntake: {
        source: "sealed_canonical_intake_projection" as const,
        receiptBound: true,
        reviewerCommitted: false,
      },
      committed: {
        source: "case_state" as const,
        receiptBound: false,
        reviewerCommitted: true,
      },
      topLevelCompatibility: {
        documents: "derivedIntake.registeredSources",
        entities: "derivedIntake.entities",
        quotes: "not_projected",
        claims: "derivedIntake.claimCandidates",
        findings: "derivedIntake.verificationRecords",
        events: "derivedIntake.events",
        relationships: "derivedIntake.relationships",
        signalFlags: "derivedIntake.structuralSignals",
      },
    },
  };
}
