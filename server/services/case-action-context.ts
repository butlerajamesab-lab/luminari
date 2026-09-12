import { TRPCError } from '@trpc/server';
import { query_with_diagnostics } from '../db-legacy';
import { read_availability } from '../read-availability';
import { read_current_legal_authorities } from './current-legal-authority-reader';
import { resolve_legal_reference } from '../legal-reference-runtime';
import { searchPublishableResourceDirectory as search_resources } from './resource-directory-publishable';
import { load_governed_legal_registry } from '../intake-governed-legal-registry';
import { RULE_MANIFEST } from '../engines/intake-spine/layer-14-action_paths';
import { workflowJurisdictionCode as jurisdiction_code } from '../engines/intake-spine/source-workflow-registry';

export type case_action_context_request = {
  case_id: number; problem_context?: string; jurisdiction?: string; limit_per_surface?: number;
};
const query_options = { label: 'case_action_context', pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 };
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

async function query(sql: string, params: unknown[]) {
  return query_with_diagnostics<Record<string, unknown>>(sql, params, query_options);
}

async function surface<T>(scope: string, limit: number, read: (() => Promise<T[]>) | null) {
  if (!read) return { items: null, availability: read_availability(null), scope, returned: null, has_more: null };
  try {
    const items = await read();
    return { items: items.slice(0, limit), availability: read_availability(items.length), scope,
      returned: Math.min(items.length, limit), has_more: items.length > limit };
  } catch (error) {
    return { items: null, availability: read_availability(null, error), scope, returned: null, has_more: null };
  }
}

/** IDs belong exclusively to public.cases, the same namespace as case_state
 * and both explicit attachment tables. Authentication comes from the caller,
 * never from model-generated tool arguments. No implicit legacy-case join. */
export async function get_case_action_context(input: case_action_context_request, user_id: number) {
  if (!Number.isSafeInteger(user_id) || user_id <= 0) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (!Number.isSafeInteger(input.case_id) || input.case_id <= 0) throw new TRPCError({ code: 'BAD_REQUEST' });
  const limit = Math.max(1, Math.min(25, Number.isFinite(input.limit_per_surface) ? Math.trunc(input.limit_per_surface!) : 6));
  const owned = await query('select id,name,domain,pipeline_type from public.cases where id = $1 and user_id = $2', [input.case_id, user_id]);
  const case_record = owned.rows[0];
  if (!case_record) throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found or access denied' });
  const state = await surface('saved_case_state', 1, async () => (await query(
    'select jurisdiction,claim_type,committed_statute_ids from public.case_state where case_id = $1 and user_id = $2', [input.case_id, user_id])).rows);
  const state_row = state.items?.[0];
  const jurisdiction = jurisdiction_code(text(input.jurisdiction) ?? text(state_row?.jurisdiction));
  const claim_type = text(state_row?.claim_type);
  const problem_context = text(input.problem_context);
  const registry_needed = Boolean(jurisdiction && claim_type);
  // The loader used by Intake (#635) provides the same identities and source receipts.
  const registry = registry_needed ? load_governed_legal_registry({ query: (sql: string, params?: unknown[]) => query(sql, params ?? []) } as Parameters<typeof load_governed_legal_registry>[0]) : null;
  // Share one settled read so independent surfaces survive registry failure.
  const registry_result = registry?.then(value => ({ value, error: null as unknown }), error => ({ value: null, error }));
  const aliases = claim_type ? [claim_type, ...(RULE_MANIFEST.workflow_issue_aliases[claim_type] ?? [])] : [];
  const legal_refs = Array.isArray(state_row?.committed_statute_ids)
    ? state_row.committed_statute_ids.filter((ref): ref is string | number => typeof ref === 'string' || typeof ref === 'number') : [];
  const [legal_authorities, resources, attached_resources, signals, legal_attachments, workflows, deadlines, enforcement] = await Promise.all([
    surface('jurisdiction_catalog_search; case applicability not established', limit, jurisdiction ? async () =>
      (await read_current_legal_authorities({ jurisdiction, query: problem_context ?? undefined, limit: limit + 1 })).items : null),
    surface('jurisdiction_directory_search; case applicability not established', limit, jurisdiction ? async () =>
      (await search_resources({ jurisdiction, query: problem_context ?? undefined, limit: limit + 1, offset: 0 })).items : null),
    surface('explicit_case_links', limit, async () => (await query(`select resource_ref,resource_name,source_lane,created_at
      from public.case_resource_links where case_id = $1 and user_id = $2 and removed_at is null order by created_at desc,resource_ref limit $3`, [input.case_id,user_id,limit+1])).rows),
    surface('explicit_case_links; relationships remain reviewer-authored', limit, async () => (await query(`select link_id::text,domain_code,
      coalesce(legal_pattern_id,live_data_signal_id,convergence_id,intake_signal_id)::text as signal_record_id,
      relationship_type,reviewer_notes,artifact_title_snapshot,artifact_type_snapshot,artifact_source_hash,link_hash,created_at
      from public.signal_artifact_case_links_v1 where case_id = $1 order by created_at desc,link_id limit $2`, [input.case_id,limit+1])).rows),
    surface('explicit_saved_legal_references', limit, state.items ? async () => Promise.all(legal_refs.slice(0,limit+1).map(async ref => {
      try { return await resolve_legal_reference(ref); }
      catch { return { committed_ref: ref, kind: null, id: String(ref), status: 'unavailable' as const, reason: 'Source read is unavailable; the saved reference is preserved.', record: null }; }
    })) : null),
    surface('declared_jurisdiction_and_claim_binding; applicability not evaluated', limit, registry_result ? async () => {
      const result = await registry_result; if (!result.value) throw result.error;
      return result.value.manifest.workflows.filter(workflow => jurisdiction_code(workflow.jurisdiction) === jurisdiction
        && workflow.issue_types.some(issue => aliases.includes(issue))).map(workflow => ({ ...workflow, registry_hash: result.value!.rule_manifest_hash }));
    } : null),
    surface('declared_jurisdiction_and_claim_domain; domain candidates, no claim applicability or dates calculated', limit, registry_result ? async () => {
      const result = await registry_result; if (!result.value) throw result.error;
      const claim = result.value.manifest.claims.find(record => record.claim_type_id === claim_type);
      if (!claim) throw Object.assign(new Error('The saved claim has no domain binding in the governed registry'), { code: 'MISSING_BINDING' });
      return result.value.manifest.deadlines.filter(deadline => jurisdiction_code(deadline.jurisdiction) === jurisdiction
        && deadline.claim_domain === claim.domain).map(deadline => ({ ...deadline, binding_state: 'domain_candidate_not_claim_specific', calculation_state: 'not_calculated', registry_hash: result.value!.rule_manifest_hash }));
    } : null),
    surface('exact_jurisdiction_and_declared_pipeline_category; source references', limit, jurisdiction && text(case_record.pipeline_type) ? async () => (await query(`
      select civic_object_uid,object_ref,name,description,jurisdiction,state_code,category,source_locator,source_content_sha256,
             source_candidate_hash,field_provenance,data_state
        from public.v_lighthouse_civic_object_current_v1
       where object_class = 'enforcement_pathway' and typed_ready and jurisdiction_ready
         and upper(coalesce(nullif(state_code,''),jurisdiction)) = $1 and category = $2
       order by object_ref limit $3`, [jurisdiction,case_record.pipeline_type,limit+1])).rows : null),
  ]);
  return { contract_version: 'case_action_context_v1' as const, case_namespace: 'public.cases' as const, case_id: input.case_id,
    request: { jurisdiction, jurisdiction_source: input.jurisdiction ? 'request' : 'case_state', claim_type, problem_context, limit_per_surface: limit },
    case_state_availability: state.availability,
    legal_authorities, resources, attached_resources, signals, legal_attachments, workflows, deadlines, enforcement,
    semantics: 'Co-display does not establish a case relationship, convergence, legal finding, or deadline. Explicit links retain their recorded meaning.' };
}
export type case_action_context = Awaited<ReturnType<typeof get_case_action_context>>;
