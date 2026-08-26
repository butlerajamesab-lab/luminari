import { getPool } from "./db-legacy";

type FoiaListOptions = {
  statusFilter?: string;
  limit?: number;
};

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFoiaRequest(row: Record<string, unknown>) {
  return {
    ...row,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    submittedAt: nullableNumber(row.submittedAt),
    responseDueAt: nullableNumber(row.responseDueAt),
    responseReceivedAt: nullableNumber(row.responseReceivedAt),
  };
}

/**
 * Read FOIA requests from the production PostgreSQL contract.
 *
 * As of 2026-08-26 the reference tables are populated (foia_statutes: federal +
 * 50 states + DC; foia_agencies: 615 federal components via api.foia.gov), so
 * statute and agency enrichment is joined live from the snake_case production
 * columns. Requests without a linked statute/agency still read cleanly — the
 * left joins keep enrichment fields null rather than dropping the row.
 */
export async function listAllUserFoiaRequests(userId: number, opts?: FoiaListOptions) {
  const params: unknown[] = [userId];
  const statusFilter =
    opts?.statusFilter && opts.statusFilter !== "all"
      ? `and r.foia_request_status = $${params.push(opts.statusFilter)}`
      : "";
  const boundedLimit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const limitPlaceholder = `$${params.push(boundedLimit)}`;

  const { rows } = await getPool().query(
    `select
       r.id,
       r.case_id as "caseId",
       c.name as "caseName",
       c.pipeline_type as "casePipelineType",
       r.missing_record_id as "missingRecordId",
       r.agency_id as "agencyId",
       r.statute_id as "statuteId",
       r.domain,
       r.record_type as "recordType",
       r.state_code as "stateCode",
       r.request_fingerprint as "requestFingerprint",
       r.letter_content as "letterContent",
       r.requester_name as "requesterName",
       r.requester_email as "requesterEmail",
       r.agency_name as "agencyName",
       r.agency_address as "agencyAddress",
       r.agency_email as "agencyEmail",
       r.foia_request_status as status,
       r.warm_handoff as "warmHandoff",
       r.warm_handoff_reason as "warmHandoffReason",
       r.created_at as "createdAt",
       r.updated_at as "updatedAt",
       r.submitted_at as "submittedAt",
       r.response_due_at as "responseDueAt",
       r.response_received_at as "responseReceivedAt",
       s.statute_name as "statuteLawName",
       s.citation as "statuteReference",
       s.response_days as "responseDeadlineDays",
       s.fee_waiver_available as "feeWaiverAvailable",
       a.submission_methods as "agencySubmissionMethods",
       a.submission_portal as "agencyPortalUrl",
       a.jurisdiction_level as "agencyJurisdictionLevel"
     from public.foia_requests r
     left join public.cases c on c.id = r.case_id
     left join public.foia_statutes s on s.id = r.statute_id
     left join public.foia_agencies a on a.id = r.agency_id
     where r.user_id = $1
       ${statusFilter}
     order by r.updated_at desc
     limit ${limitPlaceholder}`,
    params,
  );

  return rows.map(normalizeFoiaRequest);
}
