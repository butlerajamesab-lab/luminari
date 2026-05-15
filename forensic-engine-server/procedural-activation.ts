/**
 * Procedural Activation Layer
 * 
 * Makes procedural outputs visible and triggerable.
 * Creates activation records for concrete action execution.
 * 
 * No external integrations, deterministic only.
 */

import { db as defaultDb } from "./db";
import { proceduralOutputs, activationOutputs } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { sendSlackAlertIfNotAlerted } from "./integrations/slack-alerts";

export type ActivationStatus = "pending" | "in_progress" | "completed";

export interface Activation {
  clusterId: string;
  procedureType: "alert" | "track" | "record";
  steps: string[];
  status: ActivationStatus;
}

/**
 * Generate activation records from procedural outputs
 */
export async function runActivationEngine(
  dbInstance: any = defaultDb
): Promise<Activation[]> {
  console.log("[Activation Engine] Starting activation record generation...");

  // Query all procedures from proceduralOutputs
  const procedures = await dbInstance.select().from(proceduralOutputs);

  console.log(`[Activation Engine] Found ${procedures.length} procedures to activate`);

  const activations: Activation[] = [];

  for (const procedure of procedures) {
    // Create activation record with pending status
    const activation: Activation = {
      clusterId: procedure.clusterId,
      procedureType: procedure.procedureType as "alert" | "track" | "record",
      steps: procedure.steps as string[],
      status: "pending",
    };

    activations.push(activation);

    console.log(
      `[Activation Engine] Generated activation for ${procedure.clusterId}: ${procedure.procedureType} (status: pending)`
    );
  }

  console.log(`[Activation Engine] Total activations: ${activations.length}`);
  console.log(
    `[Activation Engine] Status breakdown: pending=${activations.filter((a) => a.status === "pending").length}, in_progress=${activations.filter((a) => a.status === "in_progress").length}, completed=${activations.filter((a) => a.status === "completed").length}`
  );

  // Persist activations to activationOutputs
  console.log(`[Activation Engine] Persisting ${activations.length} activations to activationOutputs...`);
  const now = Date.now();

  for (const activation of activations) {
    try {
      // Use raw SQL for MySQL upsert (ON DUPLICATE KEY UPDATE)
      await dbInstance.execute(
        sql`
          INSERT INTO activation_outputs (
            cluster_id, procedure_type, steps, status, created_at, updated_at
          ) VALUES (
            ${activation.clusterId},
            ${activation.procedureType},
            ${JSON.stringify(activation.steps)},
            ${activation.status},
            ${now},
            ${now}
          )
          ON DUPLICATE KEY UPDATE
            procedure_type = VALUES(procedure_type),
            steps = VALUES(steps),
            updated_at = VALUES(updated_at)
        `
      );
      console.log(
        `[Activation Engine] Persisted activation for ${activation.clusterId}: ${activation.procedureType}`
      );

      // Send Slack alert if this is an "alert" procedure type
      if (activation.procedureType === "alert") {
        try {
          await sendSlackAlertIfNotAlerted(dbInstance, {
            clusterId: activation.clusterId,
            procedureType: activation.procedureType,
            steps: activation.steps,
            alertedAt: null,
          });
        } catch (error) {
          console.error(
            `[Activation Engine] Error sending Slack alert for ${activation.clusterId}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error(`[Activation Engine] Error persisting activation for ${activation.clusterId}:`, error);
    }
  }

  console.log(`[Activation Engine] Persistence complete`);

  return activations;
}

/**
 * Get pending activations (ready to execute)
 */
export async function getPendingActivations(
  dbInstance: any = defaultDb
): Promise<Activation[]> {
  console.log("[Activation Engine] Retrieving pending activations...");

  const pending = await dbInstance
    .select()
    .from(activationOutputs)
    .where(eq(activationOutputs.status, "pending"));

  console.log(`[Activation Engine] Found ${pending.length} pending activations`);

  return pending.map((row: any) => ({
    clusterId: row.clusterId,
    procedureType: row.procedureType,
    steps: row.steps,
    status: row.status,
  }));
}

/**
 * Get activation statistics
 */
export async function getActivationStats(
  dbInstance: any = defaultDb
): Promise<{
  totalActivations: number;
  pending: number;
  inProgress: number;
  completed: number;
}> {
  const activations = await dbInstance.select().from(activationOutputs);

  return {
    totalActivations: activations.length,
    pending: activations.filter((a: any) => a.status === "pending").length,
    inProgress: activations.filter((a: any) => a.status === "in_progress").length,
    completed: activations.filter((a: any) => a.status === "completed").length,
  };
}
