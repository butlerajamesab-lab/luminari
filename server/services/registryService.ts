/**
 * Registry Service
 * 
 * Read-only queries against the immutable Luminari Registry DB
 * 
 * All operations are:
 * - read-only
 * - structured
 * - never mutate registry truth
 * 
 * Aligned with Kernel Truth:
 * - Source-grounded data only
 * - No fabrication
 * - Full auditability
 */

import { sql } from "drizzle-orm";
import { db as canonicalDb } from "../db";

/**
 * Shared read-only database connection for the registry service.
 * Uses the canonical pool from server/db.ts — see DATABASE_ACCESS_CONSTITUTION.md.
 */
function getLuminariDb() {
  return canonicalDb;
}

/**
 * Get all jurisdictions
 */
export async function getJurisdictions() {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, name, code FROM jurisdictions ORDER BY name`
  );
  return result.rows as Array<{
    id: number;
    name: string;
    code: string;
  }>;
}

/**
 * Get a single jurisdiction by ID
 */
export async function getJurisdictionById(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, name, code FROM jurisdictions WHERE id = ${jurisdictionId}`
  );
  return result.rows[0] as {
    id: number;
    name: string;
    code: string;
  } | undefined;
}

/**
 * Get programs for a jurisdiction
 */
export async function getPrograms(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, program_name, eligibility, benefits, administering_agency 
        FROM layer1_programs 
        WHERE jurisdiction_id = ${jurisdictionId}
        ORDER BY program_name`
  );
  return result.rows as Array<{
    id: number;
    program_name: string;
    eligibility: string;
    benefits: string;
    administering_agency: string;
  }>;
}

/**
 * Get a single program by ID
 */
export async function getProgramById(programId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, program_name, eligibility, benefits, administering_agency 
        FROM layer1_programs 
        WHERE id = ${programId}`
  );
  return result.rows[0] as {
    id: number;
    program_name: string;
    eligibility: string;
    benefits: string;
    administering_agency: string;
  } | undefined;
}

/**
 * Get workflows for a jurisdiction
 */
export async function getWorkflows(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, workflow_name, trigger_condition 
        FROM layer2_workflows 
        WHERE jurisdiction_id = ${jurisdictionId}
        ORDER BY workflow_name`
  );
  return result.rows as Array<{
    id: number;
    workflow_name: string;
    trigger_condition: string;
  }>;
}

/**
 * Get a single workflow by ID
 */
export async function getWorkflowById(workflowId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, workflow_name, trigger_condition 
        FROM layer2_workflows 
        WHERE id = ${workflowId}`
  );
  return result.rows[0] as {
    id: number;
    workflow_name: string;
    trigger_condition: string;
  } | undefined;
}

/**
 * Get workflow steps for a workflow
 */
export async function getWorkflowSteps(workflowId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, step_number, action, deadline 
        FROM workflow_steps 
        WHERE workflow_id = ${workflowId}
        ORDER BY step_number`
  );
  return result.rows as Array<{
    id: number;
    step_number: number;
    action: string;
    deadline: string | null;
  }>;
}

/**
 * Get accountability entities for a jurisdiction
 */
export async function getEntities(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, entity_name, entity_type 
        FROM layer3_accountability_entities 
        WHERE jurisdiction_id = ${jurisdictionId}
        ORDER BY entity_name`
  );
  return result.rows as Array<{
    id: number;
    entity_name: string;
    entity_type: string;
  }>;
}

/**
 * Get a single entity by ID
 */
export async function getEntityById(entityId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, entity_name, entity_type 
        FROM layer3_accountability_entities 
        WHERE id = ${entityId}`
  );
  return result.rows[0] as {
    id: number;
    entity_name: string;
    entity_type: string;
  } | undefined;
}

/**
 * Get enforcement signals for a jurisdiction
 */
export async function getSignals(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, signal_type, priority, action_description 
        FROM enforcement_signals 
        WHERE jurisdiction_id = ${jurisdictionId}
        ORDER BY priority DESC, signal_type`
  );
  return result.rows as Array<{
    id: number;
    signal_type: string;
    priority: string;
    action_description: string;
  }>;
}

/**
 * Get a single signal by ID
 */
export async function getSignalById(signalId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, signal_type, priority, action_description 
        FROM enforcement_signals 
        WHERE id = ${signalId}`
  );
  return result.rows[0] as {
    id: number;
    signal_type: string;
    priority: string;
    action_description: string;
  } | undefined;
}

/**
 * Search programs across all jurisdictions
 */
export async function searchPrograms(query: string, jurisdictionId?: number) {
  const db = await getLuminariDb();

  let sqlQuery;
  if (jurisdictionId) {
    sqlQuery = sql`SELECT id, program_name, eligibility, jurisdiction_id 
                    FROM layer1_programs 
                    WHERE jurisdiction_id = ${jurisdictionId}
                    AND program_name ILIKE ${'%' + query + '%'}
                    ORDER BY program_name`;
  } else {
    sqlQuery = sql`SELECT id, program_name, eligibility, jurisdiction_id 
                    FROM layer1_programs 
                    WHERE program_name ILIKE ${'%' + query + '%'}
                    ORDER BY program_name`;
  }

  const result = await db.execute(sqlQuery);
  return result.rows as Array<{
    id: number;
    program_name: string;
    eligibility: string;
    jurisdiction_id: number;
  }>;
}

/**
 * Get first matching workflow for a jurisdiction
 * (Used for intake matching)
 */
export async function getFirstWorkflow(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, workflow_name, trigger_condition 
        FROM layer2_workflows 
        WHERE jurisdiction_id = ${jurisdictionId}
        LIMIT 1`
  );
  return result.rows[0] as {
    id: number;
    workflow_name: string;
    trigger_condition: string;
  } | undefined;
}

/**
 * Get registry data for a case intake
 * Returns: workflow + steps + contacts + signals
 */
export async function getIntakeMatch(jurisdictionId: number) {
  const workflow = await getFirstWorkflow(jurisdictionId);
  if (!workflow) return null;

  const [steps, contacts, signals] = await Promise.all([
    getWorkflowSteps(workflow.id),
    getEntities(jurisdictionId),
    getSignals(jurisdictionId),
  ]);

  return {
    workflow,
    steps,
    contacts,
    signals,
  };
}
