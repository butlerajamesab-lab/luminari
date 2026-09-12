import { getPool as get_pool } from "../db";
import { resolve_legal_reference } from "../legal-reference-runtime";
import { load_governed_legal_registry } from "../intake-governed-legal-registry";
import { RULE_MANIFEST } from "../engines/intake-spine/layer-14-action_paths";
import { workflowJurisdictionCode as normalize_jurisdiction } from "../engines/intake-spine/source-workflow-registry";
import { read_availability, type read_availability_result } from "../read-availability";
import {
  read_case_legal_stats,
  read_case_contradictions,
  read_case_law,
  read_case_enforcement,
  read_case_statutes,
  read_case_weak_joints,
  read_case_enforcement_pathways,
  read_case_resources,
} from "./case-context-reader-boundary";
import { read_case_context_subject } from "./case-context-subject";
import { read_current_legal_authorities } from "./current-legal-authority-reader";
import { read_canonical_case_layer_outputs, type CanonicalCaseLayerRead as canonical_case_layer_read } from "../intake-case-layer-reader";
import type { ActionPath as action_path } from "../engines/intake-spine/layer-14-action_paths";
import { LEGAL_DOMAINS, type LegalDomain as legal_domain } from "../../drizzle/schema";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 25;

export type case_action_context_request = {
  case_id: number;
  user_id: number;
  problem_context?: string;
  jurisdiction?: string;
  incident_date?: string;
  as_of_date?: string;
  limit_per_surface?: number;
};

export type case_action_context = {
  contract_version: "case_action_context_v1";
  case_id: number;
  subject: Awaited<ReturnType<typeof read_case_context_subject>>;
  jurisdiction: { id: number | null; code: string | null; name: string | null };
  request: {
    problem_context: string | null;
    jurisdiction: string | null;
    jurisdiction_source: string;
    claim_type: string | null;
    issue_key: string | null;
    incident_date: string | null;
    as_of_date: string | null;
    limit_per_surface: number;
  };
  semantics: {
    source_record: string;
    observation: string;
    candidate: string;
    signal: string;
    convergence: string;
    finding: string;
  };
  legal: {
    source_authorities: unknown[];
    attachments: Awaited<ReturnType<typeof source_surface>>;
    statutes: unknown[];
    case_law: unknown[];
    enforcement: unknown[];
    weak_joints: unknown[];
    contradictions: unknown[];
  };
  resources: {
    directory_results: unknown[];
    attached_to_case: Array<Record<string, unknown>> | null;
    attachment_availability: read_availability_result;
  };
  workflow: {
    intake_action_paths: canonical_case_layer_read<action_path[]> | null;
    source_candidates: Awaited<ReturnType<typeof source_surface>>;
    deadline_sources: Awaited<ReturnType<typeof source_surface>>;
    intake_action_path_availability: read_availability_result;
    investigation: unknown;
    enforcement_pathways: unknown;
    filing_deadlines: unknown[];
  };
  signals: {
    lineage: Array<Record<string, unknown>> | null;
    availability: read_availability_result;
  };
  diagnostics: {
    legal_library_stats: Awaited<ReturnType<typeof read_case_legal_stats>> | null;
    fallback_surfaces: string[];
    notes: string[];
    unavailable_surfaces: string[];
  };
};

function bounded_limit(value?: number) {
  return Math.max(1, Math.min(Number(value ?? DEFAULT_LIMIT), MAX_LIMIT));
}

function trimmed_text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function issue_key(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function to_legal_domain(value: string | null): legal_domain | undefined {
  return value && (LEGAL_DOMAINS as readonly string[]).includes(value)
    ? value as legal_domain
    : undefined;
}

function case_incident_date(case_data: Record<string, unknown>) {
  return trimmed_text(case_data.incident_date);
}

async function search_with_fallback<T>(
  search_term: string | null,
  primary: () => Promise<T[]>,
  fallback: (() => Promise<T[]>) | null,
) {
  // An empty explicit search stays empty; shared words do not establish applicability.
  return { items: await primary(), fallback_used: false };
}

async function list_case_resource_links(case_id: number) {
  try {
    const { rows } = await get_pool().query(
      `select resource_ref, resource_name, source_lane, created_at
         from public.case_resource_links
        where case_id = $1 and removed_at is null
        order by created_at desc, resource_ref`,
      [case_id],
    );
    return { items: rows as Array<Record<string, unknown>>, availability: read_availability(rows.length) };
  } catch (error) {
    return { items: null, availability: read_availability(null, error) };
  }
}

async function list_case_signal_links(input: {
  case_id: number;
  limit: number;
}) {
  try {
    const { rows } = await get_pool().query(
      `select
          link_id::text as case_signal_link_id,
          domain_code,
          coalesce(legal_pattern_id, live_data_signal_id, convergence_id, intake_signal_id)::text as signal_record_id,
          relationship_type,
          reviewer_notes,
          artifact_title_snapshot as title,
          artifact_type_snapshot as artifact_type,
          artifact_source_hash as source_hash,
          link_hash,
          created_at
         from public.signal_artifact_case_links_v1
        where case_id = $1
        order by created_at desc, link_id desc
        limit $2`,
      [input.case_id, input.limit],
    );
    return { items: rows as Array<Record<string, unknown>>, availability: read_availability(rows.length) };
  } catch (error) {
    return { items: null, availability: read_availability(null, error) };
  }
}

function unavailable_scoped_workflow(reason: string) {
  return {
    domain: null,
    claim_type: null,
    agency_short: null,
    context: {
      incident_date: null,
      has_documents: false,
      has_witnesses: false,
    },
    availability: {
      status: "unavailable" as const,
      reason,
      source: "workflow_master/workflow_steps" as const,
    },
    selected_workflow: null,
    available_workflows: [],
    workflow: {
      immediate_actions: [],
      records_to_request: [],
      witness_targets: [],
      timeline_tasks: [],
      agency_steps: [],
      risk_flags: [],
      signal_watch_list: [],
    },
    source_evidence: {
      claim_elements: {
        status: "unavailable" as const,
        reason,
      },
      deadline_sources: {
        status: "unavailable" as const,
        reason,
      },
      witness_targets: {
        status: "unavailable" as const,
        reason,
      },
      deadline_calculations: {
        status: "unavailable" as const,
        reason,
      },
    },
    metadata: {
      weak_joints_considered: 0,
      signals_considered: 0,
      contradiction_templates_considered: 0,
      proof_frameworks_considered: 0,
      barriers_considered: 0,
      claim_elements_considered: 0,
    },
  };
}

function unavailable_scoped_enforcement(reason: string) {
  return {
    availability: {
      status: "unavailable" as const,
      reason,
    },
    matched_by: "none" as const,
    requested: {
      agency_short: null,
      claim_type: null,
      pipeline_category: null,
    },
    filter_options: {
      agency_shorts: [],
      claim_types: [],
      pipeline_categories: [],
    },
    total_source_rows: 0,
    matched_source_rows: 0,
    returned_source_rows: 0,
    return_limit: 0,
    source_contract: "current_civic_object_enforcement_pathways_v1",
    pathways: [],
  };
}

async function source_surface(scope: string, limit: number, read: (() => Promise<unknown[]>) | null) {
  if (!read) return { items: null, availability: read_availability(null), scope, returned: null, has_more: null };
  try {
    const items = await read();
    return { items: items.slice(0, limit), availability: read_availability(items.length), scope,
      returned: Math.min(items.length, limit), has_more: items.length > limit };
  } catch (error) {
    return { items: null, availability: read_availability(null, error), scope, returned: null, has_more: null };
  }
}

export async function get_case_action_context(
  input: case_action_context_request,
): Promise<case_action_context> {
  const limit = bounded_limit(input.limit_per_surface);
  const case_data = await read_case_context_subject(input.case_id, input.user_id);
  const requested_jurisdiction = trimmed_text(input.jurisdiction);
  const jurisdiction = { id: null, code: requested_jurisdiction ? normalize_jurisdiction(requested_jurisdiction) : case_data.jurisdiction_code,
    name: requested_jurisdiction ?? case_data.jurisdiction };
  const claim_type = case_data.claim_type;
  const registry_result = jurisdiction.code && claim_type ? load_governed_legal_registry(get_pool())
    .then(value => ({ value, error: null as unknown }), error => ({ value: null, error })) : null;
  const aliases = claim_type ? [claim_type, ...(RULE_MANIFEST.workflow_issue_aliases[claim_type] ?? [])] : [];

  const problem_context = trimmed_text(input.problem_context) ?? trimmed_text(case_data.category);
  const incident_date = trimmed_text(input.incident_date) ?? case_incident_date(case_data as unknown as Record<string, unknown>);
  const explicit_as_of_date = trimmed_text(input.as_of_date);
  const normalized_issue = issue_key(trimmed_text(case_data.category));
  const normalized_domain = to_legal_domain(normalized_issue);
  const jurisdiction_code = trimmed_text(jurisdiction.code)?.toUpperCase() ?? null;
  const fallback_surfaces: string[] = [];
  const notes: string[] = [];
  const unavailable_surfaces: string[] = [];
  const scoped = <T>(surface: string, read: () => Promise<T>, unavailable: T): Promise<T> => {
    if (jurisdiction_code) return read().catch(() => {
      unavailable_surfaces.push(surface);
      return unavailable;
    });
    unavailable_surfaces.push(surface);
    return Promise.resolve(unavailable);
  };
  if (!jurisdiction_code) notes.push("No resolved case jurisdiction is recorded; jurisdiction-scoped source lookups were not run.");

  const [
    source_authorities,
    statutes_result,
    case_law_result,
    resources_result,
    enforcement_result,
    weak_joints,
    contradictions,
    investigation,
    enforcement_pathways,
    filing_deadlines,
    attached_resources,
    signal_lineage,
    legal_stats,
    intake_action_paths,
    legal_attachments, source_candidates, deadline_sources,
  ] = await Promise.all([
    scoped("legal.source_authorities", async () => (await read_current_legal_authorities({ jurisdiction: jurisdiction_code!, query: problem_context ?? undefined, limit })).items, []),
    scoped("legal.statutes", () => search_with_fallback(
      problem_context,
      () => read_case_statutes({ jurisdiction: jurisdiction_code ?? undefined, query: problem_context ?? undefined, limit }),
      () => read_case_statutes({ jurisdiction: jurisdiction_code ?? undefined, limit }),
    ), { items: [], fallback_used: false }),
    scoped("legal.case_law", () => search_with_fallback(
      problem_context,
      () => read_case_law({ jurisdiction: jurisdiction_code ?? undefined, query: problem_context ?? undefined, limit }),
      () => read_case_law({ jurisdiction: jurisdiction_code ?? undefined, limit }),
    ), { items: [], fallback_used: false }),
    scoped("resources.directory", () => search_with_fallback(
      problem_context,
      async () => (await read_case_resources({ jurisdiction: jurisdiction_code ?? undefined, query: problem_context ?? undefined, limit, offset: 0 })).items,
      async () => (await read_case_resources({ jurisdiction: jurisdiction_code ?? undefined, limit, offset: 0 })).items,
    ), { items: [], fallback_used: false }),
    scoped("legal.enforcement", () => search_with_fallback(
      normalized_issue,
      () => read_case_enforcement({ jurisdiction: jurisdiction_code ?? undefined, domain: normalized_domain, limit }),
      () => read_case_enforcement({ jurisdiction: jurisdiction_code ?? undefined, limit }),
    ), { items: [], fallback_used: false }),
    scoped("legal.weak_joints", () => read_case_weak_joints({ jurisdiction: jurisdiction_code ?? undefined, domain: normalized_domain, limit }), []),
    scoped("legal.contradictions", () => read_case_contradictions({ jurisdiction: jurisdiction_code ?? undefined, domain: normalized_domain, limit }), []),
    Promise.resolve(unavailable_scoped_workflow("This legacy workflow reader has no jurisdiction binding; case-specific workflows remain in the governed intake action-path reader.")),
    normalized_issue && jurisdiction_code
      ? scoped("workflow.enforcement_pathways", () => read_case_enforcement_pathways({ pipeline_category: normalized_issue, jurisdiction: jurisdiction_code }),
          unavailable_scoped_enforcement("Source enforcement pathway read is unavailable."))
      : Promise.resolve(unavailable_scoped_enforcement("Case jurisdiction and claim context are required to scope enforcement pathways.")),
    Promise.resolve([]),
    list_case_resource_links(input.case_id),
    list_case_signal_links({ case_id: input.case_id, limit }),
    scoped("diagnostics.legal_library_stats", () => read_case_legal_stats(jurisdiction_code!), null),
    read_canonical_case_layer_outputs<action_path[]>(input.case_id, "action_paths")
      .then(projection => ({ projection, availability: read_availability(projection.outputs.length) }))
      .catch(error => ({ projection: null, availability: read_availability(null, error) })),
    source_surface("explicit_saved_legal_references", limit, async () => Promise.all((case_data.committed_statute_ids ?? []).slice(0, limit + 1).map(async ref => {
      try { return await resolve_legal_reference(ref); }
      catch { return { committed_ref: ref, kind: null, status: "unavailable", record: null }; }
    }))),
    source_surface("declared_jurisdiction_and_claim_binding; applicability not evaluated", limit, registry_result ? async () => {
      const result = await registry_result; if (!result.value) throw result.error;
      return result.value.manifest.workflows.filter(workflow => normalize_jurisdiction(workflow.jurisdiction) === jurisdiction_code
        && workflow.issue_types.some(issue => aliases.includes(issue))).map(workflow => ({ ...workflow, registry_hash: result.value!.rule_manifest_hash }));
    } : null),
    source_surface("declared_jurisdiction_and_claim_domain; source text only, no dates calculated", limit, registry_result ? async () => {
      const result = await registry_result; if (!result.value) throw result.error;
      const claim = result.value.manifest.claims.find(record => record.claim_type_id === claim_type);
      if (!claim) throw Object.assign(new Error("The saved claim has no governed domain binding"), { code: "MISSING_BINDING" });
      return result.value.manifest.deadlines.filter(deadline => normalize_jurisdiction(deadline.jurisdiction) === jurisdiction_code
        && deadline.claim_domain === claim.domain).map(deadline => ({ ...deadline, binding_state: "domain_candidate_not_claim_specific", calculation_state: "not_calculated", registry_hash: result.value!.rule_manifest_hash }));
    } : null),
  ]);

  if (statutes_result.fallback_used) fallback_surfaces.push("legal.statutes");
  if (case_law_result.fallback_used) fallback_surfaces.push("legal.case_law");
  if (resources_result.fallback_used) fallback_surfaces.push("resources.directory");
  if (enforcement_result.fallback_used) fallback_surfaces.push("legal.enforcement");
  if (!incident_date) {
    notes.push("Filing deadline calculations stay bounded to source text and require an incident_date; none was supplied.");
  }
  unavailable_surfaces.push("workflow.investigation", "workflow.filing_deadlines");
  notes.push("An incident date alone does not bind an agency form or jurisdiction to this case; no filing deadline was calculated.");
  if ((legal_stats?.held_legal_references ?? 0) > 0) {
    notes.push("Current legal substrate contains observed-but-not-catalog-ready authorities; they remain held from public legal search and are counted separately in the source authority inventory.");
  }

  return {
    contract_version: "case_action_context_v1",
    case_id: case_data.id,
    subject: case_data,
    jurisdiction: {
      id: jurisdiction.id,
      code: jurisdiction_code,
      name: trimmed_text(jurisdiction.name),
    },
    request: {
      jurisdiction: jurisdiction_code,
      jurisdiction_source: requested_jurisdiction ? "explicit_browse_request" : "recorded_case_and_intake",
      claim_type: claim_type ?? null,
      problem_context: problem_context,
      issue_key: normalized_issue,
      incident_date: incident_date,
      as_of_date: explicit_as_of_date,
      limit_per_surface: limit,
    },
    semantics: {
      source_record: "Not returned directly; the contract reads source-backed runtime projections only.",
      observation: "Returned legal/resource/workflow rows are source-backed observations with publication state preserved; compatibility rows remain explicitly labeled.",
      candidate: "Candidates remain in corpus/reconciliation tables and are not promoted or rewritten here.",
      signal: "Signal rows remain signals; the contract does not upgrade them into convergences or findings.",
      convergence: "No convergence objects are synthesized by this contract.",
      finding: "No findings are invented; downstream adjudication remains separate.",
    },
    legal: {
      source_authorities,
      attachments: legal_attachments,
      statutes: statutes_result.items,
      case_law: case_law_result.items,
      enforcement: enforcement_result.items,
      weak_joints: weak_joints,
      contradictions,
    },
    resources: {
      directory_results: resources_result.items,
      attached_to_case: attached_resources.items,
      attachment_availability: attached_resources.availability,
    },
    workflow: {
      intake_action_paths: intake_action_paths.projection,
      source_candidates, deadline_sources,
      intake_action_path_availability: intake_action_paths.availability,
      investigation: investigation,
      enforcement_pathways: enforcement_pathways,
      filing_deadlines: filing_deadlines,
    },
    signals: {
      lineage: signal_lineage.items,
      availability: signal_lineage.availability,
    },
    diagnostics: {
      legal_library_stats: legal_stats,
      fallback_surfaces: fallback_surfaces,
      notes,
      unavailable_surfaces,
    },
  };
}
