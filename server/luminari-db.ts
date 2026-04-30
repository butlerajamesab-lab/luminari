/**
 * Luminari Registry Database Helper
 * 
 * Queries the immutable luminari_registry PostgreSQL database
 * Separate from the forensic-engine database
 * 
 * All data is source-grounded and read-only
 */

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Create a separate database connection to luminari_registry
 */
export async function getLuminariDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");

  const pool = new Pool({
    host: process.env.LUMINARI_DB_HOST || "localhost",
    port: parseInt(process.env.LUMINARI_DB_PORT || "5432"),
    database: process.env.LUMINARI_DB_NAME || "luminari_registry",
    user: process.env.LUMINARI_DB_USER || "postgres",
    password: process.env.LUMINARI_DB_PASSWORD || "postgres",
  });

  return drizzle(pool);
}

/**
 * Query jurisdictions from Luminari Registry
 */
export async function getJurisdictions() {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, name, code FROM jurisdictions ORDER BY name`
  );
  return result.rows;
}

/**
 * Match workflow for a given category and jurisdiction
 */
export async function matchWorkflow(
  jurisdictionId: number,
  category?: string
) {
  const db = await getLuminariDb();

  // Query workflow
  const workflowResult = await db.execute(
    sql`SELECT id, workflow_name, trigger_condition 
        FROM layer2_workflows 
        WHERE jurisdiction_id = ${jurisdictionId}
        LIMIT 1`
  );

  if (workflowResult.rows.length === 0) {
    return null;
  }

  const workflow = workflowResult.rows[0] as any;

  // Get workflow steps
  const stepsResult = await db.execute(
    sql`SELECT id, step_number, action, deadline 
        FROM workflow_steps 
        WHERE workflow_id = ${workflow.id}
        ORDER BY step_number`
  );

  // Get linked accountability entities
  const contactsResult = await db.execute(
    sql`SELECT id, entity_name, entity_type 
        FROM layer3_accountability_entities 
        WHERE jurisdiction_id = ${jurisdictionId}
        LIMIT 5`
  );

  // Get enforcement signals
  const signalsResult = await db.execute(
    sql`SELECT id, signal_type, priority, action_description 
        FROM enforcement_signals 
        WHERE jurisdiction_id = ${jurisdictionId}
        LIMIT 5`
  );

  return {
    workflow_id: workflow.id,
    workflow_name: workflow.workflow_name,
    trigger_condition: workflow.trigger_condition,
    steps: stepsResult.rows,
    contacts: contactsResult.rows,
    signals: signalsResult.rows,
  };
}

/**
 * Get programs for a jurisdiction
 */
export async function getPrograms(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, program_name, eligibility, benefits, administering_agency 
        FROM layer1_programs 
        WHERE jurisdiction_id = ${jurisdictionId}`
  );
  return result.rows;
}

/**
 * Get workflows for a jurisdiction
 */
export async function getWorkflows(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, workflow_name, trigger_condition 
        FROM layer2_workflows 
        WHERE jurisdiction_id = ${jurisdictionId}`
  );
  return result.rows;
}

/**
 * Get accountability entities for a jurisdiction
 */
export async function getEntities(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, entity_name, entity_type 
        FROM layer3_accountability_entities 
        WHERE jurisdiction_id = ${jurisdictionId}`
  );
  return result.rows;
}

/**
 * Get enforcement signals for a jurisdiction
 */
export async function getSignals(jurisdictionId: number) {
  const db = await getLuminariDb();
  const result = await db.execute(
    sql`SELECT id, signal_type, priority, action_description 
        FROM enforcement_signals 
        WHERE jurisdiction_id = ${jurisdictionId}`
  );
  return result.rows;
}

/**
 * Search programs across all jurisdictions
 */
export async function searchPrograms(query: string, jurisdictionId?: number) {
  const db = await getLuminariDb();

  let sqlQuery = sql`SELECT id, program_name, eligibility, jurisdiction_id 
                      FROM layer1_programs 
                      WHERE program_name ILIKE ${'%' + query + '%'}`;

  if (jurisdictionId) {
    sqlQuery = sql`SELECT id, program_name, eligibility, jurisdiction_id 
                    FROM layer1_programs 
                    WHERE jurisdiction_id = ${jurisdictionId}
                    AND program_name ILIKE ${'%' + query + '%'}`;
  }

  const result = await db.execute(sqlQuery);
  return result.rows;
}
