/**
 * Luminari Context Service
 * 
 * Unified context endpoint for Sunam integration
 * Composes data from registryService, caseService, and matchingService
 * 
 * Returns complete case context without direct SQL access
 */

import * as registryService from "./registryService";
import * as caseService from "./caseService";
import * as matchingService from "./matchingService";

export interface LuminariContext {
  case: {
    id: number;
    jurisdiction_id: number;
    category: string;
    selected_workflow_id: number;
    status: string;
    created_at: number;
    notes?: string[];
    timeline?: any[];
  };
  jurisdiction: {
    id: number;
    name: string;
    code: string;
  };
  workflows: any[];
  programs: any[];
  entities: any[];
  signals: any[];
  legal_library: any[];
  enforcement_pathways: any[];
  deadlines: any[];
  diagnostics: {
    total_workflows: number;
    total_programs: number;
    total_entities: number;
    total_signals: number;
    case_status: string;
    last_updated: number;
  };
}

/**
 * Get unified context for a case
 * 
 * Composes:
 * - Case data from caseService
 * - Jurisdiction data from registryService
 * - Workflows, programs, entities, signals from registryService
 * - Case timeline and notes from caseService
 * 
 * No direct SQL access - all through service layer
 */
export async function getCaseContext(caseId: number): Promise<LuminariContext> {
  // Step 1: Get case data
  const caseData = await caseService.getCaseById(caseId);
  if (!caseData) {
    throw new Error(`Case ${caseId} not found`);
  }

  // Step 2: Get jurisdiction
  const jurisdiction = await registryService.getJurisdictionById(
    caseData.jurisdiction_id
  );
  if (!jurisdiction) {
    throw new Error(
      `Jurisdiction ${caseData.jurisdiction_id} not found in registry`
    );
  }

  // Step 3: Get workflows for jurisdiction
  const workflows = await registryService.getWorkflows(caseData.jurisdiction_id);

  // Step 4: Get programs for jurisdiction
  const programs = await registryService.getPrograms(caseData.jurisdiction_id);

  // Step 5: Get entities for jurisdiction
  const entities = await registryService.getEntities(caseData.jurisdiction_id);

  // Step 6: Get signals for jurisdiction
  const signals = await registryService.getSignals(caseData.jurisdiction_id);

  // Step 7: Get case timeline
  const timeline = await caseService.getCaseTimeline(caseId);

  // Step 8: Get case notes
  const notes = await caseService.getCaseNotes(caseId);

  // Step 9: Compose context
  return {
    case: {
      id: caseData.id,
      jurisdiction_id: caseData.jurisdiction_id,
      category: caseData.category,
      selected_workflow_id: caseData.selected_workflow_id,
      status: caseData.status,
      created_at: caseData.created_at,
      notes: notes.map((n: any) => n.note_text),
      timeline,
    },
    jurisdiction,
    workflows,
    programs,
    entities,
    signals,
    legal_library: [], // Placeholder for legal library data
    enforcement_pathways: [], // Placeholder for enforcement pathways
    deadlines: [], // Placeholder for deadlines
    diagnostics: {
      total_workflows: workflows.length,
      total_programs: programs.length,
      total_entities: entities.length,
      total_signals: signals.length,
      case_status: caseData.status,
      last_updated: Date.now(),
    },
  };
}

/**
 * Get case context with validation results
 * 
 * Extends getCaseContext with validation and reconciliation data
 */
export async function getCaseContextWithValidation(
  caseId: number
): Promise<LuminariContext & { validation_results?: any[] }> {
  const context = await getCaseContext(caseId);

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



// ============================================================
