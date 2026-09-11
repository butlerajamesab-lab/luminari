import { getPool } from "../db";
import {
  getRuntimeLegalLibraryStats,
  listRuntimeContradictions,
  searchRuntimeCaseLaw,
  searchRuntimeEnforcement,
  searchRuntimeStatutes,
  searchRuntimeWeakJoints,
} from "../legal-library-runtime-db";
import { list_filing_deadline_records, utc_today_date_only } from "../filing-deadline-runtime-compat";
import { read_enforcement_pathways } from "../enforcement-pathway-runtime-compat";
import { read_investigation_workflow } from "../investigation-workflow-runtime-compat";
import { searchPublishableResourceDirectory } from "./resource-directory-publishable";
import * as caseService from "./caseService";
import * as registryService from "./registryService";
import { LEGAL_DOMAINS, type LegalDomain } from "../../drizzle/schema";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 25;

export type CaseActionContextRequest = {
  caseId: number;
  problemContext?: string;
  incidentDate?: string;
  asOfDate?: string;
  limitPerSurface?: number;
};

export type CaseActionContext = {
  contract_version: "case_action_context_v1";
  case_id: number;
  jurisdiction: { id: number; code: string | null; name: string | null };
  request: {
    problem_context: string | null;
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
    statutes: unknown[];
    case_law: unknown[];
    enforcement: unknown[];
    weak_joints: unknown[];
    contradictions: unknown[];
  };
  resources: {
    directory_results: unknown[];
    attached_to_case: Array<Record<string, unknown>>;
  };
  workflow: {
    investigation: unknown;
    enforcement_pathways: unknown;
    filing_deadlines: unknown[];
  };
  signals: {
    lineage: Array<Record<string, unknown>>;
  };
  diagnostics: {
    legal_library_stats: Awaited<ReturnType<typeof getRuntimeLegalLibraryStats>>;
    fallback_surfaces: string[];
    notes: string[];
  };
};

function boundedLimit(value?: number) {
  return Math.max(1, Math.min(Number(value ?? DEFAULT_LIMIT), MAX_LIMIT));
}

function trimmedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function issueKey(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function toLegalDomain(value: string | null): LegalDomain | undefined {
  return value && (LEGAL_DOMAINS as readonly string[]).includes(value)
    ? value as LegalDomain
    : undefined;
}

function caseIncidentDate(caseData: Record<string, unknown>) {
  return trimmedText(caseData.incident_date) ?? trimmedText(caseData.incidentDate);
}

async function searchWithFallback<T>(
  searchTerm: string | null,
  primary: () => Promise<T[]>,
  fallback: (() => Promise<T[]>) | null,
) {
  const primaryItems = await primary();
  if (primaryItems.length > 0 || !searchTerm || !fallback) {
    return { items: primaryItems, fallbackUsed: false };
  }
  return { items: await fallback(), fallbackUsed: true };
}

async function listCaseResourceLinks(caseId: number) {
  try {
    const { rows } = await getPool().query(
      `select resource_ref, resource_name, source_lane, created_at
         from public.case_resource_links
        where case_id = $1 and removed_at is null
        order by created_at desc, resource_ref`,
      [caseId],
    );
    return rows as Array<Record<string, unknown>>;
  } catch {
    return [] as Array<Record<string, unknown>>;
  }
}

async function listCaseSignalLinks(input: {
  caseId: number;
  limit: number;
}) {
  try {
    const { rows } = await getPool().query(
      `select
          link_id::text as case_signal_link_id,
          domain_code,
          coalesce(legal_pattern_id, live_data_signal_id, convergence_id, intake_signal_id)::text as signal_record_id,
          relationship_type,
          reviewer_notes,
          artifact_title_snapshot as title,
          artifact_type_snapshot as artifact_type,
          artifact_source_hash as source_hash,
          created_at
         from public.signal_artifact_case_links_v1
        where case_id = $1
        order by created_at desc, link_id desc
        limit $2`,
      [input.caseId, input.limit],
    );
    return rows as Array<Record<string, unknown>>;
  } catch {
    return [] as Array<Record<string, unknown>>;
  }
}

function unavailableScopedWorkflow(reason: string) {
  return {
    domain: null,
    claimType: null,
    agencyShort: null,
    context: {
      incidentDate: null,
      hasDocuments: false,
      hasWitnesses: false,
    },
    availability: {
      status: "unavailable" as const,
      reason,
      source: "workflow_master/workflow_steps" as const,
    },
    selectedWorkflow: null,
    availableWorkflows: [],
    workflow: {
      immediateActions: [],
      recordsToRequest: [],
      witnessTargets: [],
      timelineTasks: [],
      agencySteps: [],
      riskFlags: [],
      signalWatchList: [],
    },
    sourceEvidence: {
      claimElements: {
        status: "unavailable" as const,
        reason,
      },
      deadlineSources: {
        status: "unavailable" as const,
        reason,
      },
      witnessTargets: {
        status: "unavailable" as const,
        reason,
      },
      deadlineCalculations: {
        status: "unavailable" as const,
        reason,
      },
    },
    metadata: {
      weakJointsConsidered: 0,
      signalsConsidered: 0,
      contradictionTemplatesConsidered: 0,
      proofFrameworksConsidered: 0,
      barriersConsidered: 0,
      claimElementsConsidered: 0,
    },
  };
}

function unavailableScopedEnforcement(reason: string) {
  return {
    availability: {
      status: "unavailable" as const,
      reason,
    },
    matchedBy: "none" as const,
    requested: {
      agencyShort: null,
      claimType: null,
      pipelineCategory: null,
    },
    filterOptions: {
      agencyShorts: [],
      claimTypes: [],
      pipelineCategories: [],
    },
    totalSourceRows: 0,
    matchedSourceRows: 0,
    returnedSourceRows: 0,
    returnLimit: 0,
    sourceContract: "current_civic_object_enforcement_pathways_v1",
    pathways: [],
  };
}

export async function getCaseActionContext(
  input: CaseActionContextRequest,
): Promise<CaseActionContext> {
  const limit = boundedLimit(input.limitPerSurface);
  const caseData = await caseService.getCaseById(input.caseId);
  if (!caseData) {
    throw new Error(`Case ${input.caseId} not found`);
  }

  const jurisdiction = await registryService.getJurisdictionById(caseData.jurisdiction_id);
  if (!jurisdiction) {
    throw new Error(`Jurisdiction ${caseData.jurisdiction_id} not found in registry`);
  }

  const problemContext = trimmedText(input.problemContext) ?? trimmedText(caseData.category);
  const incidentDate = trimmedText(input.incidentDate) ?? caseIncidentDate(caseData as unknown as Record<string, unknown>);
  const explicitAsOfDate = trimmedText(input.asOfDate);
  const filingAsOfDate = incidentDate ? explicitAsOfDate ?? utc_today_date_only() : explicitAsOfDate;
  const normalizedIssue = issueKey(problemContext);
  const normalizedDomain = toLegalDomain(normalizedIssue);
  const jurisdictionCode = trimmedText(jurisdiction.code)?.toUpperCase() ?? null;
  const fallbackSurfaces: string[] = [];
  const notes: string[] = [];

  const [
    statutesResult,
    caseLawResult,
    resourcesResult,
    enforcementResult,
    weakJoints,
    contradictions,
    investigation,
    enforcementPathways,
    filingDeadlines,
    attachedResources,
    signalLineage,
    legalStats,
  ] = await Promise.all([
    searchWithFallback(
      problemContext,
      () => searchRuntimeStatutes({ jurisdiction: jurisdictionCode ?? undefined, query: problemContext ?? undefined, limit }),
      () => searchRuntimeStatutes({ jurisdiction: jurisdictionCode ?? undefined, limit }),
    ),
    searchWithFallback(
      problemContext,
      () => searchRuntimeCaseLaw({ jurisdiction: jurisdictionCode ?? undefined, query: problemContext ?? undefined, limit }),
      () => searchRuntimeCaseLaw({ jurisdiction: jurisdictionCode ?? undefined, limit }),
    ),
    searchWithFallback(
      problemContext,
      async () => (await searchPublishableResourceDirectory({ jurisdiction: jurisdictionCode ?? undefined, query: problemContext ?? undefined, limit, offset: 0 })).items,
      async () => (await searchPublishableResourceDirectory({ jurisdiction: jurisdictionCode ?? undefined, limit, offset: 0 })).items,
    ),
    searchWithFallback(
      normalizedIssue,
      () => searchRuntimeEnforcement({ jurisdiction: jurisdictionCode ?? undefined, domain: normalizedDomain, limit }),
      () => searchRuntimeEnforcement({ jurisdiction: jurisdictionCode ?? undefined, limit }),
    ),
    searchRuntimeWeakJoints({ jurisdiction: jurisdictionCode ?? undefined, domain: normalizedDomain, limit }),
    listRuntimeContradictions({ jurisdiction: jurisdictionCode ?? undefined, domain: normalizedDomain, limit }),
      normalizedIssue
        ? read_investigation_workflow({
            domain: normalizedIssue,
            claimType: problemContext ?? undefined,
            hasDocuments: false,
            hasWitnesses: false,
          })
        : Promise.resolve(
            unavailableScopedWorkflow(
              "Case category or problem context is required to scope investigation workflows.",
            ),
          ),
      normalizedIssue
        ? read_enforcement_pathways({ pipelineCategory: normalizedIssue })
        : Promise.resolve(
            unavailableScopedEnforcement(
              "Case category or problem context is required to scope enforcement pathways.",
            ),
          ),
    incidentDate
      ? list_filing_deadline_records({
          incidentDate,
          asOfDate: filingAsOfDate ?? undefined,
        })
      : Promise.resolve([]),
    listCaseResourceLinks(input.caseId),
    listCaseSignalLinks({ caseId: input.caseId, limit }),
    getRuntimeLegalLibraryStats(jurisdictionCode ?? undefined),
  ]);

  if (statutesResult.fallbackUsed) fallbackSurfaces.push("legal.statutes");
  if (caseLawResult.fallbackUsed) fallbackSurfaces.push("legal.case_law");
  if (resourcesResult.fallbackUsed) fallbackSurfaces.push("resources.directory");
  if (enforcementResult.fallbackUsed) fallbackSurfaces.push("legal.enforcement");
  if (!incidentDate) {
    notes.push("Filing deadline calculations stay bounded to source text and require an incident_date; none was supplied.");
  }
  if (legalStats.strandedCurrentCorpusLegalAuthorities > 0) {
    notes.push("Current legal substrate contains observed-but-not-catalog-ready authorities; they remain visible as substrate observations rather than promoted findings.");
  }

  return {
    contract_version: "case_action_context_v1",
    case_id: caseData.id,
    jurisdiction: {
      id: jurisdiction.id,
      code: jurisdictionCode,
      name: trimmedText(jurisdiction.name),
    },
    request: {
      problem_context: problemContext,
      issue_key: normalizedIssue,
      incident_date: incidentDate,
      as_of_date: explicitAsOfDate,
      limit_per_surface: limit,
    },
    semantics: {
      source_record: "Not returned directly; the contract reads source-backed runtime projections only.",
      observation: "Returned legal/resource/workflow rows are source-backed observations and may still be unpublished or compatibility-backed.",
      candidate: "Candidates remain in corpus/reconciliation tables and are not promoted or rewritten here.",
      signal: "Signal rows remain signals; the contract does not upgrade them into convergences or findings.",
      convergence: "No convergence objects are synthesized by this contract.",
      finding: "No findings are invented; downstream adjudication remains separate.",
    },
    legal: {
      statutes: statutesResult.items,
      case_law: caseLawResult.items,
      enforcement: enforcementResult.items,
      weak_joints: weakJoints,
      contradictions,
    },
    resources: {
      directory_results: resourcesResult.items,
      attached_to_case: attachedResources,
    },
    workflow: {
      investigation: investigation,
      enforcement_pathways: enforcementPathways,
      filing_deadlines: filingDeadlines,
    },
    signals: {
      lineage: signalLineage,
    },
    diagnostics: {
      legal_library_stats: legalStats,
      fallback_surfaces: fallbackSurfaces,
      notes,
    },
  };
}
