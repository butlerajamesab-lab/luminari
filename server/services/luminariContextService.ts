/**
 * Luminari Context Service
 * 
 * Unified context endpoint for Sunam integration
 * Composes authorized workspace cases and source-bound readers
 * 
 * Returns complete case context without direct SQL access
 */

import { read_case_timeline } from "./case-context-reader-boundary";
import { read_availability } from "../read-availability";
import { get_case_action_context } from "./case-action-context";
export { get_case_action_context } from "./case-action-context";

export type luminari_context = Awaited<ReturnType<typeof get_case_context>>;

/** Compose context only after workspace case access and identity are verified. */
export async function get_case_context(case_id: number, user_id: number) {
  const action_context = await get_case_action_context({ case_id: case_id, user_id, limit_per_surface: 6 });
  const subject = action_context.subject;
  const timeline_result = await read_case_timeline(case_id)
    .then(items => ({ items, availability: read_availability(items.length) }))
    .catch(error => ({ items: null, availability: read_availability(null, error) }));
  const legal_library = [
    ...action_context.legal.statutes, ...action_context.legal.case_law,
    ...action_context.legal.enforcement, ...action_context.legal.weak_joints,
    ...action_context.legal.contradictions,
  ];
  const resources = action_context.resources.directory_results;
  const enforcement_pathways = (action_context.workflow.enforcement_pathways as any)?.pathways ?? [];
  return {
    case: {
      id: subject.id, jurisdiction_id: null, category: subject.category,
      selected_workflow_id: null, status: subject.status, created_at: subject.created_at,
      name: subject.name, case_namespace: subject.case_namespace,
      notes: null, timeline: timeline_result.items,
    },
    jurisdiction: action_context.jurisdiction,
    workflows: [], programs: [], resources, entities: [],
    signals: action_context.signals.lineage,
    legal_library,
    source_authorities: action_context.legal.source_authorities,
    enforcement_pathways,
    deadlines: action_context.workflow.filing_deadlines,
    action_context,
    diagnostics: {
      total_workflows: null, total_programs: null, total_resources: resources.length,
      total_entities: null, total_signals: action_context.signals.lineage?.length ?? null,
      total_legal_library_records: legal_library.length,
      total_source_authorities: action_context.legal.source_authorities.length,
      total_enforcement_pathways: enforcement_pathways.length,
      total_deadlines: null,
      case_status: subject.status, last_updated: subject.updated_at,
      timeline_availability: timeline_result.availability,
      unavailable_surfaces: [...action_context.diagnostics.unavailable_surfaces, "case.notes", "registry.programs", "registry.entities"],
      notes: ["No numeric legacy registry jurisdiction or selected-workflow identity is inferred from workspace case IDs."],
    },
  };
}

/**
 * Get case context with validation results
 * 
 * Extends get_case_context with validation and reconciliation data
 */
export async function get_case_context_with_validation(
  case_id: number, user_id: number
): Promise<luminari_context & { validation_results?: any[] }> {
  const context = await get_case_context(case_id, user_id);

  // TODO: Fetch validation results from validation_results table
  // This will be populated by the write endpoints

  return context;
}

/**
 * Record validation result for a case
 * 
 * Called by Sunam after validation
 */
export async function recordValidationResult(
  caseId: number,
  validationData: {
    validation_type: string;
    result: string;
    confidence_score?: number;
    notes?: string;
  }
): Promise<void> {
  // TODO: Write to validation_results table
  console.log(
    `[ValidationResult] Case ${caseId}: ${validationData.validation_type} = ${validationData.result}`
  );
}

/**
 * Record reconciliation for a case
 * 
 * Called by Sunam after reconciliation
 */
export async function recordReconciliation(
  caseId: number,
  reconciliationData: {
    run_id: string;
    total_rows: number;
    discrepancy_count: number;
    status: string;
    notes?: string;
  }
): Promise<void> {
  // TODO: Write to reconciliation_records table
  console.log(
    `[Reconciliation] Case ${caseId}: ${reconciliationData.total_rows} rows, ${reconciliationData.discrepancy_count} discrepancies`
  );
}
