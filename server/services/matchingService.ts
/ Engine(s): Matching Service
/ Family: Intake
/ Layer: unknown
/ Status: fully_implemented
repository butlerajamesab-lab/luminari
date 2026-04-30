/**
 * Matching Service
 * 
 * Orchestrate intake → case creation → registry matching
 * 
 * Composition layer that:
 * 1. Creates case in Case DB
 * 2. Queries registry for matching workflow
 * 3. Returns composed response
 * 
 * Aligned with Kernel Truth:
 * - Deterministic matching
 * - Full auditability
 * - No fabrication
 */

import * as caseService from "./caseService";
import * as registryService from "./registryService";

export interface IntakeInput {
  jurisdiction_id: number;
  category: string;
  intake_answers: Record<string, any>;
  user_id?: number | null;
}

export interface MatchedResponse {
  case: {
    id: number;
    jurisdiction_id: number;
    category: string;
    selected_workflow_id: number;
    status: string;
    created_at: number;
  };
  registry: {
    jurisdiction: any;
    workflow: any;
    steps: any[];
    contacts: any[];
    signals: any[];
    programs: any[];
  };
}

/**
 * Process intake: create case + match registry
 */
export async function processIntake(input: IntakeInput): Promise<MatchedResponse> {
  // Step 1: Get jurisdiction to validate
  const jurisdiction = await registryService.getJurisdictionById(input.jurisdiction_id);
  if (!jurisdiction) {
    throw new Error(`Jurisdiction ${input.jurisdiction_id} not found`);
  }

  // Step 2: Get matching workflow for category
  const workflow = await registryService.getIntakeMatch(
    input.jurisdiction_id
  );
  if (!workflow) {
    throw new Error(
      `No workflow found for ${input.category} in ${jurisdiction.name}`
    );
  }

  // Step 3: Create case in Case DB
  const caseRecord = await caseService.createCase({
    user_id: input.user_id || null,
    jurisdiction_id: input.jurisdiction_id,
    category: input.category,
    selected_workflow_id: (workflow as any).id,
  });

  // Step 4: Record intake event
  await caseService.recordCaseEvent((caseRecord as any).id, "intake_completed", {
    category: input.category,
    answers: input.intake_answers,
  });

  // Step 5: Get full registry context
  const steps = await registryService.getWorkflowSteps((workflow as any).id);
  const contacts = await registryService.getWorkflowSteps((workflow as any).id);
  const signals = await registryService.getJurisdictions();
  const programs = await registryService.getPrograms(
    input.jurisdiction_id
  );

  return {
    case: {
      id: (caseRecord as any).id,
      jurisdiction_id: caseRecord.jurisdiction_id,
      category: caseRecord.category,
      selected_workflow_id: caseRecord.selected_workflow_id,
      status: caseRecord.status,
      created_at: caseRecord.created_at,
    },
    registry: {
      jurisdiction,
      workflow,
      steps,
      contacts,
      signals,
      programs,
    },
  };
}

/**
 * Get case with full registry context
 */
export async function getCaseWithContext(caseId: number): Promise<MatchedResponse> {
  // Step 1: Get case
  const caseRecord = await caseService.getCaseById(caseId);
  if (!caseRecord) {
    throw new Error(`Case ${caseId} not found`);
  }

  // Step 2: Get jurisdiction
  const jurisdiction = await registryService.getJurisdictionById(
    caseRecord.jurisdiction_id
  );
  if (!jurisdiction) {
    throw new Error(
      `Jurisdiction ${caseRecord.jurisdiction_id} not found in registry`
    );
  }

  // Step 3: Get workflow
  const workflow = await registryService.getWorkflowById(
    caseRecord.selected_workflow_id
  );
  if (!workflow) {
    throw new Error(
      `Workflow ${caseRecord.selected_workflow_id} not found in registry`
    );
  }

  // Step 4: Get full context
  const steps = await registryService.getWorkflowSteps((workflow as any).id);
  const contacts = await registryService.getWorkflowSteps((workflow as any).id);
  const signals = await registryService.getJurisdictions();
  const programs = await registryService.getPrograms(
    caseRecord.jurisdiction_id
  );

  return {
    case: {
      id: (caseRecord as any).id,
      jurisdiction_id: caseRecord.jurisdiction_id,
      category: caseRecord.category,
      selected_workflow_id: caseRecord.selected_workflow_id,
      status: caseRecord.status,
      created_at: caseRecord.created_at,
    },
    registry: {
      jurisdiction,
      workflow,
      steps,
      contacts,
      signals,
      programs,
    },
  };
}

/**
 * Record user action
 */
export async function recordAction(
  caseId: number,
  type: string,
  description: string
): Promise<void> {
  await caseService.recordCaseAction(caseId, type, { description });
  await caseService.recordCaseEvent(caseId, "action_recorded", {
    type,
    description,
  });
}

/**
 * Add note to case
 */
export async function addNote(caseId: number, note: string): Promise<void> {
  await caseService.addCaseNote(caseId, note);
  await caseService.recordCaseEvent(caseId, "note_added", { note });
}

/**
 * Request case expungement
 */
export async function requestExpungement(caseId: number): Promise<void> {
  await caseService.markCaseForExpungement(caseId);
  await caseService.recordCaseEvent(caseId, "expungement_requested", {
    timestamp: Date.now(),
  });
}
