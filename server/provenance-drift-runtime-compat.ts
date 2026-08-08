import { getPool } from "./db-legacy";

export type ProvenanceDriftMeasurementState = "not_evaluated" | "evaluated" | "incomplete";

export type ProvenanceDriftMetricsCompat = {
  measurementState: ProvenanceDriftMeasurementState;
  totalFindings: number;
  linkedFindings: number;
  unsupportedFindings: number;
  provenanceCoverage: number | null;
  avgClaimsPerFinding: number | null;
  fallbackMatcherHitRate: number | null;
  unsupportedRate: number | null;
  avgProcessingTimeMs: number | null;
  claimIdParseFailures: number;
  findingsByCase: Array<{
    caseId: number;
    caseName: string;
    total: number;
    linked: number;
    unsupported: number;
  }>;
};

function as_number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function claim_id_count(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

/**
 * Live-Postgres implementation of the provenance drift metric surface.
 *
 * The historical helper used MySQL JSON_LENGTH(claim_ids), but production
 * stores claim_ids as TEXT and PostgreSQL has no JSON_LENGTH(text) function.
 * Reading the rows and parsing the persisted JSON text explicitly keeps the
 * metric deterministic and prevents dialect-specific SQL from hiding drift.
 *
 * Empty populations are not 100% coverage. They are not evaluated, so ratio
 * metrics are null. If a linked finding contains malformed claim_ids JSON, the
 * average-claims metric is also null and measurementState becomes incomplete.
 */
export async function getProvenanceDriftMetrics(
  caseId?: number,
): Promise<ProvenanceDriftMetricsCompat> {
  const result = await getPool().query(
    `select
       f.case_id,
       c.name as case_name,
       f.provenance_status,
       f.claim_ids
     from public.findings f
     left join public.cases c on c.id = f.case_id
     where ($1::integer is null or f.case_id = $1)
     order by f.case_id, f.id`,
    [caseId ?? null],
  );

  const rows = result.rows as Array<{
    case_id: unknown;
    case_name: unknown;
    provenance_status: unknown;
    claim_ids: unknown;
  }>;

  const total = rows.length;
  let linked = 0;
  let unsupported = 0;
  let linkedClaimTotal = 0;
  let linkedClaimRows = 0;
  let claimIdParseFailures = 0;

  const perCase = new Map<number, {
    caseId: number;
    caseName: string;
    total: number;
    linked: number;
    unsupported: number;
  }>();

  for (const row of rows) {
    const status = String(row.provenance_status ?? "");
    const rowCaseId = as_number(row.case_id);
    const existing = perCase.get(rowCaseId) ?? {
      caseId: rowCaseId,
      caseName: row.case_name ? String(row.case_name) : "Unknown",
      total: 0,
      linked: 0,
      unsupported: 0,
    };
    existing.total += 1;

    if (status === "linked") {
      linked += 1;
      existing.linked += 1;
      const count = claim_id_count(row.claim_ids);
      if (count === null) {
        claimIdParseFailures += 1;
      } else {
        linkedClaimTotal += count;
        linkedClaimRows += 1;
      }
    } else if (status === "unsupported") {
      unsupported += 1;
      existing.unsupported += 1;
    }

    perCase.set(rowCaseId, existing);
  }

  const measurementState: ProvenanceDriftMeasurementState = total === 0
    ? "not_evaluated"
    : claimIdParseFailures > 0
      ? "incomplete"
      : "evaluated";

  return {
    measurementState,
    totalFindings: total,
    linkedFindings: linked,
    unsupportedFindings: unsupported,
    provenanceCoverage: total > 0
      ? Math.round((linked / total) * 10000) / 100
      : null,
    avgClaimsPerFinding: linked === 0 || claimIdParseFailures > 0
      ? null
      : Math.round((linkedClaimTotal / linkedClaimRows) * 100) / 100,
    // Runtime fallback/processing counters are supplied by the router from the
    // live queue state. Do not fabricate database-derived values here.
    fallbackMatcherHitRate: null,
    unsupportedRate: total > 0
      ? Math.round((unsupported / total) * 10000) / 100
      : null,
    avgProcessingTimeMs: null,
    claimIdParseFailures,
    findingsByCase: [...perCase.values()].sort((a, b) =>
      a.caseId - b.caseId || a.caseName.localeCompare(b.caseName),
    ),
  };
}
