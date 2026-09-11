import { getPool } from "../db";
import {
  getRuntimeLegalLibraryStats,
  listRuntimeContradictions,
  searchRuntimeCaseLaw,
  searchRuntimeEnforcement,
  searchRuntimeStatutes,
  searchRuntimeWeakJoints,
} from "../legal-library-runtime-db";
import { list_filing_deadline_records } from "../filing-deadline-runtime-compat";
import { read_enforcement_pathways } from "../enforcement-pathway-runtime-compat";
import { read_investigation_workflow } from "../investigation-workflow-runtime-compat";
import { searchPublishableResourceDirectory } from "./resource-directory-publishable";
import * as caseService from "./caseService";
import * as registryService from "./registryService";

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

async function listSignalLineage(input: {
  jurisdictionCode: string | null;
  searchTerm: string | null;
  limit: number;
}) {
  try {
    const { rows } = await getPool().query(
      `select detected_signal_id,
              signal_type,
              jurisdiction_raw_value,
              confidence_score,
              severity,
              detected_at,
              source_system,
              source_connector_id
         from public.v_signal_lineage
        where ($1::text is null or upper(jurisdiction_raw_value) = $1)
          and ($2::text is null or coalesce(signal_type, '') ilike $2)
        order by detected_at desc nulls last, detected_signal_id desc
        limit $3`,
      [input.jurisdictionCode, input.searchTerm ? `%${input.searchTerm}%` : null, input.limit],
    );
    return rows as Array<Record<string, unknown>>;
  } catch {
    return [] as Array<Record<string, unknown>>;
  }
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
  const normalizedIssue = issueKey(problemContext);
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
      () => searchRuntimeEnforcement({ jurisdiction: jurisdictionCode ?? undefined, domain: normalizedIssue ?? undefined, limit }),
      () => searchRuntimeEnforcement({ jurisdiction: jurisdictionCode ?? undefined, limit }),
    ),
    searchRuntimeWeakJoints({ jurisdiction: jurisdictionCode ?? undefined, domain: normalizedIssue ?? undefined, limit }),
    listRuntimeContradictions({ jurisdiction: jurisdictionCode ?? undefined, domain: normalizedIssue ?? undefined, limit }),
    read_investigation_workflow({
      domain: normalizedIssue ?? "general",
      claimType: problemContext ?? undefined,
      hasDocuments: false,
      hasWitnesses: false,
    }),
    read_enforcement_pathways({ pipelineCategory: normalizedIssue ?? undefined }),
    input.incidentDate
      ? list_filing_deadline_records({
          incidentDate: input.incidentDate,
          asOfDate: input.asOfDate,
        })
      : Promise.resolve([]),
    listCaseResourceLinks(input.caseId),
    listSignalLineage({ jurisdictionCode, searchTerm: problemContext, limit }),
    getRuntimeLegalLibraryStats(jurisdictionCode ?? undefined),
  ]);

  if (statutesResult.fallbackUsed) fallbackSurfaces.push("legal.statutes");
  if (caseLawResult.fallbackUsed) fallbackSurfaces.push("legal.case_law");
  if (resourcesResult.fallbackUsed) fallbackSurfaces.push("resources.directory");
  if (enforcementResult.fallbackUsed) fallbackSurfaces.push("legal.enforcement");
  if (!input.incidentDate) {
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
      incident_date: input.incidentDate ?? null,
      as_of_date: input.asOfDate ?? null,
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
