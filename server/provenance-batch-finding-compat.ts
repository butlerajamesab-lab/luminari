import { getPool } from "./db-legacy";

function as_number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function as_nullable_number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parse_json_array(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (value === null || value === undefined || value === "") return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function parse_json_object(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function document_label(filename: string | null | undefined): string {
  if (!filename) return "Unknown Document";
  const match = filename.match(/EFTA[- _]?\d+/i);
  return match ? match[0].toUpperCase().replace(/[_ ]/g, "-") : filename;
}

/**
 * Batch-only finding detail reader against the live public.findings contract.
 * The production table stores two booleans as INTEGER 0/1 and two JSON values
 * as TEXT, so the drifted Drizzle model is not used at this boundary.
 */
export async function getFindingMatchDetail(findingId: number) {
  const findingResult = await getPool().query(
    `select id, case_id, finding_type, title, description, significance,
            claim_ids, confidence, created_at, finding_evidentiary_weight,
            provenance_status, provenance_attempted, candidate_claim_count,
            fallback_triggered, match_attempt_timestamp, match_metadata,
            lane_id, snapshot_id
       from public.findings
      where id = $1
      limit 1`,
    [findingId],
  );
  if (findingResult.rows.length === 0) return null;
  const row: any = findingResult.rows[0];
  const evidentiaryWeight = String(row.finding_evidentiary_weight ?? "note_signal");
  const matchMetadata = parse_json_object(row.match_metadata);
  const finding = {
    id: as_number(row.id),
    caseId: as_number(row.case_id),
    findingType: String(row.finding_type ?? "unknown"),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    significance: row.significance === null || row.significance === undefined ? null : String(row.significance),
    claimIds: parse_json_array(row.claim_ids),
    confidence: String(row.confidence ?? "unresolved"),
    createdAt: as_number(row.created_at),
    findingEvidentiaryWeight: evidentiaryWeight,
    evidentiaryWeight,
    provenanceStatus: String(row.provenance_status ?? "unsupported"),
    provenanceAttempted: as_number(row.provenance_attempted) === 1,
    candidateClaimCount: as_number(row.candidate_claim_count),
    fallbackTriggered: as_number(row.fallback_triggered) === 1,
    matchAttemptTimestamp: as_nullable_number(row.match_attempt_timestamp),
    matchMetadata,
    laneId: row.lane_id === null || row.lane_id === undefined ? null : String(row.lane_id),
    snapshotId: as_nullable_number(row.snapshot_id),
  };

  const claimsResult = await getPool().query(
    `select c.id, c.claim_text, c.claim_type, c.document_id, d.filename
       from public.claims c
       left join public.documents d on d.id = c.document_id
      where c.case_id = $1
      order by c.id`,
    [finding.caseId],
  );
  const candidateClaims = claimsResult.rows.map((claim: any) => ({
    id: String(claim.id),
    claimText: String(claim.claim_text ?? ""),
    claimType: claim.claim_type === null || claim.claim_type === undefined ? null : String(claim.claim_type),
    documentId: claim.document_id === null || claim.document_id === undefined ? null : String(claim.document_id),
    documentLabel: document_label(claim.filename),
  }));

  const auditResult = await getPool().query(
    `select id, user_id, case_id, action_type, target_type, target_id, details, created_at
       from public.provenance_audit_logs
      where target_id = $1
      order by created_at desc, id desc`,
    [findingId],
  );
  const auditLog = auditResult.rows.map((audit: any) => ({
    id: as_number(audit.id),
    userId: as_number(audit.user_id),
    caseId: as_number(audit.case_id),
    actionType: String(audit.action_type ?? ""),
    targetType: String(audit.target_type ?? ""),
    targetId: as_number(audit.target_id),
    details: parse_json_object(audit.details),
    createdAt: as_number(audit.created_at),
  }));

  return { finding, candidateClaims, matchMetadata, auditLog };
}

/** Persist a processor error in the live TEXT/INTEGER findings representation. */
export async function markFindingRerunError(
  findingId: number,
  batchId: number,
  errorMessage: string,
) {
  const now = Date.now();
  const result = await getPool().query(
    `update public.findings
        set provenance_status = 'rerun_error',
            provenance_attempted = 1,
            match_attempt_timestamp = $2,
            match_metadata = $3
      where id = $1
      returning id`,
    [
      findingId,
      now,
      JSON.stringify({ batchRerunId: batchId, error: errorMessage, errorAt: now }),
    ],
  );
  if (result.rows.length !== 1) throw new Error(`finding_not_found:${findingId}`);
}
