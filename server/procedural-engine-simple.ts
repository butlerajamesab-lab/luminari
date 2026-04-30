/**
 * Procedural Engine (Simple)
 * 
 * Translates strategies into concrete procedural actions.
 * Generates step-by-step procedures for implementation.
 * 
 * No external integrations, no side effects beyond DB.
 */

import { db as defaultDb } from "./db";
import { strategyOutputs, proceduralOutputs } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { isQuarantinedCluster } from "./pattern-engine-simple";

export interface Procedure {
  clusterId: string;
  procedureType: "alert" | "track" | "record";
  steps: string[];
  strategyType: "escalate" | "monitor" | "log";
}

/**
 * Generate procedure from strategy
 */
function generateProcedure(
  clusterId: string,
  strategyType: "escalate" | "monitor" | "log"
): Procedure {
  let procedureType: "alert" | "track" | "record";
  let steps: string[];

  switch (strategyType) {
    case "escalate":
      procedureType = "alert";
      steps = ["flag_for_review", "notify_admin", "prioritize_queue"];
      break;
    case "monitor":
      procedureType = "track";
      steps = ["log_pattern", "schedule_review", "watch_for_growth"];
      break;
    case "log":
      procedureType = "record";
      steps = ["store_pattern", "no_immediate_action"];
      break;
  }

  return {
    clusterId,
    procedureType,
    steps,
    strategyType,
  };
}

/**
 * Generate procedures from strategies
 */
export async function runProceduralEngine(
  dbInstance: any = defaultDb
): Promise<Procedure[]> {
  console.log("[Procedural Engine] Starting procedure generation...");

  // Query only non-quarantined strategies from strategyOutputs
  const strategies = await dbInstance
    .select()
    .from(strategyOutputs)
    .where(eq(strategyOutputs.isQuarantined, 0));

  console.log(`[Procedural Engine] Found ${strategies.length} non-quarantined strategies to process`);

  const procedures: Procedure[] = [];
  let guardSkipped = 0;

  for (const strategy of strategies) {
    // ── Quarantine Guard ──────────────────────────────────────────────────
    // Double-check cluster prefix even if is_quarantined flag was somehow missed
    if (isQuarantinedCluster(strategy.clusterId)) {
      guardSkipped++;
      console.log(`[Procedural Engine] GUARD: Skipping quarantined cluster ${strategy.clusterId}`);
      continue;
    }

    const procedure = generateProcedure(
      strategy.clusterId,
      strategy.strategyType as "escalate" | "monitor" | "log"
    );

    procedures.push(procedure);

    console.log(
      `[Procedural Engine] Generated procedure for ${strategy.clusterId}: ${procedure.procedureType} (${procedure.steps.length} steps)`
    );
  }

  if (guardSkipped > 0) {
    console.log(`[Procedural Engine] GUARD: Blocked ${guardSkipped} quarantined clusters`);
  }

  console.log(`[Procedural Engine] Total procedures: ${procedures.length}`);
  console.log(
    `[Procedural Engine] Type breakdown: alert=${procedures.filter((p) => p.procedureType === "alert").length}, track=${procedures.filter((p) => p.procedureType === "track").length}, record=${procedures.filter((p) => p.procedureType === "record").length}`
  );

  // Persist procedures to proceduralOutputs — only non-quarantined
  console.log(`[Procedural Engine] Persisting ${procedures.length} procedures to proceduralOutputs...`);
  const now = Date.now();

  for (const procedure of procedures) {
    try {
      await dbInstance.execute(
        sql`
          INSERT INTO procedural_outputs (
            cluster_id, procedure_type, steps, created_at, updated_at
          ) VALUES (
            ${procedure.clusterId},
            ${procedure.procedureType},
            ${JSON.stringify(procedure.steps)},
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
        `[Procedural Engine] Persisted procedure for ${procedure.clusterId}: ${procedure.procedureType}`
      );
    } catch (error) {
      console.error(`[Procedural Engine] Error persisting procedure for ${procedure.clusterId}:`, error);
    }
  }

  console.log(`[Procedural Engine] Persistence complete`);

  return procedures;
}

/**
 * Get procedural statistics
 */
export async function getProceduralStats(
  dbInstance: any = defaultDb
): Promise<{
  totalProcedures: number;
  alert: number;
  track: number;
  record: number;
}> {
  const procedures = await runProceduralEngine(dbInstance);

  return {
    totalProcedures: procedures.length,
    alert: procedures.filter((p) => p.procedureType === "alert").length,
    track: procedures.filter((p) => p.procedureType === "track").length,
    record: procedures.filter((p) => p.procedureType === "record").length,
  };
}
