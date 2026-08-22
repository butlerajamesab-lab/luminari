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
 * Production intentionally has only identity/state columns in foia_statutes
 * and foia_agencies. Enrichment fields therefore remain explicit nulls until
 * governed source rows are promoted; the user-owned request and case state
 * remain readable without inventing details or querying absent columns.
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
       null::text as "statuteLawName",
       null::text as "statuteReference",
       null::integer as "responseDeadlineDays",
       null::boolean as "feeWaiverAvailable",
       null::text as "agencySubmissionMethods",
       null::text as "agencyPortalUrl",
       null::text as "agencyJurisdictionLevel"
     from public.foia_requests r
     left join public.cases c on c.id = r.case_id
     where r.user_id = $1
       ${statusFilter}
     order by r.updated_at desc
     limit ${limitPlaceholder}`,
    params,
  );

  return rows.map(normalizeFoiaRequest);
}
