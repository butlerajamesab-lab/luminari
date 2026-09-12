import { TRPCError } from "@trpc/server";
import { getPool as get_pool, verifyCaseOwnership as verify_case_access } from "../db";
import { workflowJurisdictionCode as jurisdiction_code } from "../engines/intake-spine/source-workflow-registry";

export async function read_case_context_subject(case_id: number, user_id: number) {
  if (!Number.isSafeInteger(case_id) || case_id <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A positive integer workspace case ID is required" });
  if (!Number.isSafeInteger(user_id) || user_id <= 0) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated user required" });
  // Normalize the established legacy access-helper DTO at this boundary.
  const { id: authorized_case_id, userId: owner_id } = await verify_case_access(case_id, user_id);
  if (authorized_case_id !== case_id) throw new TRPCError({ code: "FORBIDDEN", message: "Case identity mismatch" });
  const result = await get_pool().query(`
    select c.id,c.user_id,c.name,c.description,c.domain,c.status,c.created_at,c.updated_at,
      s.claim_type,s.jurisdiction,s.procedural_path_id,s.committed_statute_ids,b.case_uuid::text,
      intake.intake_jurisdictions,intake.intake_session_ids
    from public.cases c
    left join public.case_state s on s.case_id=c.id and s.user_id=c.user_id
    left join public.case_identity_bridge b on b.legacy_case_id=c.id
    left join lateral (
      select array_remove(array_agg(distinct nullif(btrim(coalesce(
        session.metadata #>> '{last_governed_execution,jurisdiction}',
        session.metadata #>> '{declared_context,jurisdiction}',
        session.metadata #>> '{declared_jurisdiction}',
        session.metadata #>> '{jurisdiction}', '')), '')),null) as intake_jurisdictions,
        array_agg(distinct session.intake_session_id::text) as intake_session_ids
      from public.case_intake_links link
      join public.intake_sessions session on session.intake_session_id=link.intake_session_id
      where link.case_uuid=b.case_uuid and link.is_primary=true
        and link.link_type='primary_projection' and session.session_type='live'
    ) intake on true
    where c.id=$1`, [case_id]);
  if (!result.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
  if (result.rows.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "Ambiguous workspace case identity" });
  const row = result.rows[0];
  if (row.id !== case_id || row.user_id !== owner_id) throw new TRPCError({ code: "FORBIDDEN", message: "Case ownership changed during context read" });
  const jurisdiction_sources = [row.jurisdiction, ...(row.intake_jurisdictions ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const codes = jurisdiction_sources.map(value => jurisdiction_code(value));
  const distinct_codes = [...new Set(codes.filter((value): value is string => value !== null))];
  const resolved_code = distinct_codes.length === 1 && codes.every(value => value !== null) ? distinct_codes[0] : null;
  return {
    id: Number(row.id), user_id: Number(row.user_id), name: String(row.name),
    description: row.description as string | null, category: (row.claim_type ?? row.domain) as string | null,
    claim_type: (row.claim_type ?? null) as string | null,
    committed_statute_ids: (Array.isArray(row.committed_statute_ids) ? row.committed_statute_ids : []) as Array<string | number>,
    status: String(row.status), created_at: Number(row.created_at), updated_at: Number(row.updated_at),
    jurisdiction: (row.jurisdiction ?? resolved_code) as string | null,
    jurisdiction_code: resolved_code,
    jurisdiction_resolution: resolved_code ? "resolved" : distinct_codes.length > 1 ? "conflict" : "unresolved",
    jurisdiction_sources,
    case_uuid: (row.case_uuid ?? null) as string | null,
    intake_session_ids: (row.intake_session_ids ?? []) as string[],
    // These are separate namespaces; no numeric registry identity is implied.
    jurisdiction_id: null, selected_workflow_id: null,
    procedural_path_id: row.procedural_path_id as number | null,
    case_namespace: "public.cases" as const,
  };
}
