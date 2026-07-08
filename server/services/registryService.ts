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

import { query_with_diagnostics } from "../db";

// All registry reads share the same timeout budget.
// Pool acquire: fail fast so a saturated pool doesn't queue indefinitely.
// Query timeout: generous enough for real reads, tight enough to shed load.
const REGISTRY_POOL_ACQUIRE_MS = 1000;
const REGISTRY_QUERY_TIMEOUT_MS = 4000;

function registry_query<T = unknown>(label: string, text: string, values: unknown[] = []) {
  return query_with_diagnostics<T>(text, values, {
    label,
    pool_acquire_timeout_ms: REGISTRY_POOL_ACQUIRE_MS,
    query_timeout_ms: REGISTRY_QUERY_TIMEOUT_MS,
  });
}

type JurisdictionRow = {
  id: number;
  name: string;
  code: string;
};

const JURISDICTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
let jurisdictions_cache: { expires_at: number; rows: JurisdictionRow[] } | null = null;

function map_jurisdiction_rows(rows: unknown[]): JurisdictionRow[] {
  return rows.map((row: any) => ({
    id: Number(row.id),
    name: String(row.name),
    code: String(row.code),
  }));
}

/**
 * Get all jurisdictions
 */
export async function getJurisdictions() {
  const now = Date.now();
  if (jurisdictions_cache && jurisdictions_cache.expires_at > now) {
    return jurisdictions_cache.rows;
  }

  try {
    const result = await registry_query<JurisdictionRow>(
      "registry_get_jurisdictions",
      "SELECT id, name, code FROM jurisdictions ORDER BY name",
    );
    const rows = map_jurisdiction_rows(result.rows);
    jurisdictions_cache = { expires_at: now + JURISDICTIONS_CACHE_TTL_MS, rows };
    return rows;
  } catch (error) {
    if (jurisdictions_cache) {
      console.warn("[Registry] using stale jurisdictions cache after DB failure", {
        error: error instanceof Error ? error.message : String(error),
        stale_count: jurisdictions_cache.rows.length,
      });
      return jurisdictions_cache.rows;
    }
    throw error;
  }
}

/**
 * Get a single jurisdiction by ID
 */
export async function getJurisdictionById(jurisdictionId: number) {
  const result = await registry_query(
    "registry_get_jurisdiction_by_id",
    "SELECT id, name, code FROM jurisdictions WHERE id = $1",
    [jurisdictionId],
  );
  return result.rows[0] as { id: number; name: string; code: string } | undefined;
}

/**
 * Get programs for a jurisdiction
 */
export async function getPrograms(jurisdictionId: number) {
  const result = await registry_query(
    "registry_get_programs",
    `SELECT id, program_name, eligibility, benefits, administering_agency
     FROM layer1_programs
     WHERE jurisdiction_id = $1
     ORDER BY program_name`,
    [jurisdictionId],
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
  const result = await registry_query(
    "registry_get_program_by_id",
    `SELECT id, program_name, eligibility, benefits, administering_agency
     FROM layer1_programs
     WHERE id = $1`,
    [programId],
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
  const result = await registry_query(
    "registry_get_workflows",
    `SELECT id, workflow_name, trigger_condition
     FROM layer2_workflows
     WHERE jurisdiction_id = $1
     ORDER BY workflow_name`,
    [jurisdictionId],
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
  const result = await registry_query(
    "registry_get_workflow_by_id",
    `SELECT id, workflow_name, trigger_condition
     FROM layer2_workflows
     WHERE id = $1`,
    [workflowId],
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
  const result = await registry_query(
    "registry_get_workflow_steps",
    `SELECT id, step_number, action, deadline
     FROM workflow_steps
     WHERE workflow_id = $1
     ORDER BY step_number`,
    [workflowId],
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
  const result = await registry_query(
    "registry_get_entities",
    `SELECT id, entity_name, entity_type
     FROM layer3_accountability_entities
     WHERE jurisdiction_id = $1
     ORDER BY entity_name`,
    [jurisdictionId],
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
  const result = await registry_query(
    "registry_get_entity_by_id",
    `SELECT id, entity_name, entity_type
     FROM layer3_accountability_entities
     WHERE id = $1`,
    [entityId],
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
  const result = await registry_query(
    "registry_get_signals",
    `SELECT id, signal_type, priority, action_description
     FROM enforcement_signals
     WHERE jurisdiction_id = $1
     ORDER BY priority DESC, signal_type`,
    [jurisdictionId],
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
  const result = await registry_query(
    "registry_get_signal_by_id",
    `SELECT id, signal_type, priority, action_description
     FROM enforcement_signals
     WHERE id = $1`,
    [signalId],
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
  if (jurisdictionId !== undefined) {
    const result = await registry_query(
      "registry_search_programs_scoped",
      `SELECT id, program_name, eligibility, jurisdiction_id
       FROM layer1_programs
       WHERE jurisdiction_id = $1
         AND program_name ILIKE $2
       ORDER BY program_name`,
      [jurisdictionId, `%${query}%`],
    );
    return result.rows as Array<{
      id: number;
      program_name: string;
      eligibility: string;
      jurisdiction_id: number;
    }>;
  }

  const result = await registry_query(
    "registry_search_programs_global",
    `SELECT id, program_name, eligibility, jurisdiction_id
     FROM layer1_programs
     WHERE program_name ILIKE $1
     ORDER BY program_name`,
    [`%${query}%`],
  );
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
  const result = await registry_query(
    "registry_get_first_workflow",
    `SELECT id, workflow_name, trigger_condition
     FROM layer2_workflows
     WHERE jurisdiction_id = $1
     LIMIT 1`,
    [jurisdictionId],
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
