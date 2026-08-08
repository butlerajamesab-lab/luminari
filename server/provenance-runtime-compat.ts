import { getPool } from "./db-legacy";

export interface UnsupportedFindingSummary {
  id: number;
  caseId: number;
  findingType: string;
  title: string;
  description: string;
  claimIds: number[];
  confidence: string;
  evidentiaryWeight: string;
  provenanceStatus: string;
  candidateClaimCount: number;
  fallbackTriggered: boolean;
  matchAttemptTimestamp: number | null;
  createdAt: number;
  documentIds: number[];
  documentLabels: string[];
}

type CreateFindingInput = {
  caseId: number;
  findingType: string;
  title: string;
  description: string;
  significance?: string;
  claimIds?: number[];
  confidence?: "strong" | "moderate" | "preliminary";
  findingEvidentiaryWeight?: "finding" | "note_signal";
  provenanceStatus?: "linked" | "unsupported" | "unsupported_synthesis";
  provenanceAttempted?: boolean;
  candidateClaimCount?: number;
  fallbackTriggered?: boolean;
  matchMetadata?: Record<string, unknown>;
  laneId: string;
  snapshotId: number;
};

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
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function derive_document_display_label(filename: string | null | undefined): string {
  if (!filename) return "Unknown Document";
  const match = filename.match(/EFTA[- _]?\d+/i);
  return match ? match[0].toUpperCase().replace(/[_ ]/g, "-") : filename;
}

/**
 * Runtime compatibility boundary for public.findings.
 *
 * Production Postgres preserves the historical MySQL boolean representation:
 * provenance_attempted and fallback_triggered are INTEGER 0/1 columns, while
 * the legacy Drizzle declaration presents them as booleans. Direct SQL here is
 * deliberate: it preserves the live schema without mutating historical data or
 * relying on PostgreSQL to compare/assign INTEGER and BOOLEAN values.
 */
export async function listUnsupportedFindings(caseId?: number): Promise<UnsupportedFindingSummary[]> {
  const result = await getPool().query(
    `select
       f.id,
       f.case_id,
       f.finding_type,
       f.title,
       f.description,
       f.claim_ids,
       f.confidence,
       f.finding_evidentiary_weight,
       f.provenance_status,
       f.candidate_claim_count,
       f.fallback_triggered,
       f.match_attempt_timestamp,
       f.created_at
     from public.findings f
     where f.provenance_status in ('unsupported', 'unsupported_synthesis')
       and f.provenance_attempted = 1
       and ($1::integer is null or f.case_id = $1)
     order by f.created_at desc nulls last, f.id desc`,
    [caseId ?? null],
  );

  const case_ids = Array.from(new Set(
    result.rows.map((row: any) => as_number(row.case_id)).filter(id => id > 0),
  ));
  const docs_by_case = new Map<number, Array<{ id: number; filename: string }>>();

  if (case_ids.length > 0) {
    const docs = await getPool().query(
      `select id, case_id, filename
         from public.documents
        where case_id = any($1::integer[])
        order by case_id, id`,
      [case_ids],
    );
    for (const row of docs.rows as any[]) {
      const case_id = as_number(row.case_id);
      const list = docs_by_case.get(case_id) || [];
      list.push({ id: as_number(row.id), filename: String(row.filename ?? "") });
      docs_by_case.set(case_id, list);
    }
  }

  return result.rows.map((row: any) => {
    const case_id = as_number(row.case_id);
    const docs = docs_by_case.get(case_id) || [];
    return {
      id: as_number(row.id),
      caseId: case_id,
      findingType: String(row.finding_type ?? ""),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      claimIds: parse_json_array(row.claim_ids),
      confidence: String(row.confidence ?? ""),
      evidentiaryWeight: String(row.finding_evidentiary_weight ?? ""),
      provenanceStatus: String(row.provenance_status ?? ""),
      candidateClaimCount: as_number(row.candidate_claim_count),
      fallbackTriggered: as_number(row.fallback_triggered) === 1,
      matchAttemptTimestamp: as_nullable_number(row.match_attempt_timestamp),
      createdAt: as_number(row.created_at),
      documentIds: docs.map(doc => doc.id),
      documentLabels: docs.map(doc => derive_document_display_label(doc.filename)),
    };
  });
}

export async function getProvenanceDrilldownMetrics(caseId?: number) {
  const result = await getPool().query(
    `select
       count(*)::int as total_findings,
       count(*) filter (
         where provenance_status in ('unsupported', 'unsupported_synthesis')
       )::int as unsupported_count,
       count(*) filter (
         where provenance_status = 'unsupported_synthesis'
       )::int as synthesis_count,
       coalesce(sum(candidate_claim_count), 0)::bigint as total_candidates,
       count(*) filter (where fallback_triggered = 1)::int as fallback_used
     from public.findings
     where ($1::integer is null or case_id = $1)`,
    [caseId ?? null],
  );
  const row: any = result.rows[0] ?? {};
  const total = as_number(row.total_findings);
  const unsupported = as_number(row.unsupported_count);
  const synthesis = as_number(row.synthesis_count);
  const total_candidates = as_number(row.total_candidates);
  const fallback_used = as_number(row.fallback_used);

  return {
    totalFindings: total,
    unsupportedCount: unsupported,
    synthesisCount: synthesis,
    unsupportedRate: total > 0 ? Math.round((unsupported / total) * 10000) / 100 : 0,
    avgCandidateClaimsEvaluated: unsupported > 0
      ? Math.round((total_candidates / total) * 100) / 100
      : 0,
    fallbackUsageRate: total > 0 ? Math.round((fallback_used / total) * 10000) / 100 : 0,
  };
}

export async function createFinding(f: CreateFindingInput): Promise<number> {
  const claim_ids = f.claimIds ?? [];
  const provenance_status = f.provenanceStatus
    ?? (claim_ids.length > 0 ? "linked" : "unsupported");
  const provenance_attempted = f.provenanceAttempted ?? true;

  if (claim_ids.length === 0 && provenance_status === "linked") {
    throw new Error("Provenance invariant violation: finding has empty claimIds but provenanceStatus='linked' (must be 'unsupported' or 'unsupported_synthesis')");
  }
  if (claim_ids.length === 0 && !provenance_attempted) {
    throw new Error("Provenance invariant violation: finding has empty claimIds but provenanceAttempted=false (must be true)");
  }

  const now = Date.now();
  const result = await getPool().query<{ id: number }>(
    `insert into public.findings (
       case_id,
       finding_type,
       title,
       description,
       significance,
       claim_ids,
       confidence,
       created_at,
       finding_evidentiary_weight,
       provenance_status,
       provenance_attempted,
       candidate_claim_count,
       fallback_triggered,
       match_attempt_timestamp,
       match_metadata,
       lane_id,
       snapshot_id
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
     ) returning id`,
    [
      f.caseId,
      f.findingType,
      f.title,
      f.description,
      f.significance ?? null,
      JSON.stringify(claim_ids),
      f.confidence ?? null,
      now,
      f.findingEvidentiaryWeight ?? "note_signal",
      provenance_status,
      provenance_attempted ? 1 : 0,
      f.candidateClaimCount ?? 0,
      (f.fallbackTriggered ?? false) ? 1 : 0,
      now,
      f.matchMetadata ? JSON.stringify(f.matchMetadata) : null,
      f.laneId,
      f.snapshotId,
    ],
  );
  const id = as_number(result.rows[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("finding_not_persisted");
  return id;
}

export async function updateFindingClaimIds(findingId: number, claimIds: number[]) {
  const provenance_status = claimIds.length > 0 ? "linked" : "unsupported";
  await getPool().query(
    `update public.findings
        set claim_ids = $2,
            provenance_status = $3,
            provenance_attempted = 1
      where id = $1`,
    [findingId, JSON.stringify(claimIds), provenance_status],
  );
}

export async function updateFindingMatchMetadata(findingId: number, meta: {
  candidateClaimCount: number;
  fallbackTriggered: boolean;
  matchMetadata: Record<string, unknown>;
}) {
  await getPool().query(
    `update public.findings
        set candidate_claim_count = $2,
            fallback_triggered = $3,
            match_attempt_timestamp = $4,
            match_metadata = $5
      where id = $1`,
    [
      findingId,
      meta.candidateClaimCount,
      meta.fallbackTriggered ? 1 : 0,
      Date.now(),
      JSON.stringify(meta.matchMetadata),
    ],
  );
}
