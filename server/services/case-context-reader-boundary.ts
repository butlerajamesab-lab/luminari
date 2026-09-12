/**
 * Normalize existing reader DTOs as they enter the owned case-context contract.
 * Source IDs, source text, provenance, and sealed intake outputs are not rewritten.
 * Legacy identifier access is explicit here; context services consume snake_case.
 */
import {
  getRuntimeLegalLibraryStats as read_legacy_legal_stats,
  listRuntimeContradictions as read_case_contradictions,
  searchRuntimeCaseLaw as read_case_law,
  searchRuntimeEnforcement as read_case_enforcement,
  searchRuntimeStatutes as read_legacy_statutes,
  searchRuntimeWeakJoints as read_case_weak_joints,
  type LegalRuntimeSearch as legal_runtime_search,
} from "../legal-library-runtime-db";
import { searchPublishableResourceDirectory as read_case_resources } from "./resource-directory-publishable";
import { read_enforcement_pathways } from "../enforcement-pathway-runtime-compat";
import { getCaseTimelineData as read_legacy_timeline } from "../case-timeline-intake-compat";

export { read_case_contradictions, read_case_law, read_case_enforcement, read_case_weak_joints, read_case_resources };

export async function read_case_statutes(input: legal_runtime_search) {
  return (await read_legacy_statutes(input)).map(row => {
    const { keyProvisions: legacy_key_provisions, ...source_fields } = row;
    return { ...source_fields, key_provisions: source_fields.key_provisions ?? legacy_key_provisions ?? null };
  });
}

export async function read_case_legal_stats(jurisdiction: string) {
  return read_legacy_legal_stats(jurisdiction);
}

export async function read_case_enforcement_pathways(input: { pipeline_category: string; jurisdiction: string }) {
  const source = await read_enforcement_pathways(input);
  return {
    availability: source.availability,
    matched_by: source.matchedBy === "agencyShort" ? "agency_short"
      : source.matchedBy === "claimType" ? "claim_type"
      : source.matchedBy === "pipelineCategory" ? "pipeline_category" : source.matchedBy,
    requested: {
      agency_short: source.requested.agencyShort,
      claim_type: source.requested.claimType,
      pipeline_category: source.requested.pipelineCategory,
    },
    filter_options: {
      agency_shorts: source.filterOptions.agencyShorts,
      claim_types: source.filterOptions.claimTypes,
      pipeline_categories: source.filterOptions.pipelineCategories,
    },
    total_source_rows: source.totalSourceRows,
    matched_source_rows: source.matchedSourceRows,
    returned_source_rows: source.returnedSourceRows,
    return_limit: source.returnLimit,
    source_contract: source.sourceContract,
    pathways: source.pathways.map(pathway => ({
      id: pathway.id,
      pathway_id: pathway.pathwayId,
      pathway_name: pathway.pathwayName,
      jurisdiction: pathway.jurisdiction,
      domain: pathway.domain,
      description: pathway.description,
      agency_short: pathway.agencyShort,
      claim_types: pathway.claimTypes,
      pipeline_categories: pathway.pipelineCategories,
      source_state: pathway.sourceState,
      source_pending: pathway.sourcePending,
      source_url: pathway.sourceUrl,
      source_file: pathway.sourceFile,
      source_sha256: pathway.sourceSha256,
      created_at: pathway.createdAt,
    })),
  };
}

export async function read_case_timeline(case_id: number) {
  return (await read_legacy_timeline(case_id)).map(row => {
    const {
      datePrecision: date_precision,
      sortKey: sort_key,
      documentId: document_id,
      documentName: document_name,
      entityNames: entity_names,
      evidentiaryWeight: evidentiary_weight,
      ...source_fields
    } = row;
    return {
      ...source_fields, date_precision, sort_key, document_id, document_name,
      entity_names, evidentiary_weight,
    };
  });
}
