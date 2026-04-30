/**
 * Strategy Engine (Simple)
 * 
 * Generates deterministic strategies from pattern clusters.
 * Maps pattern severity to actionable strategies.
 * 
 * No inference, no ML, deterministic only.
 */

import { db as defaultDb } from "./db";
import { patternOutputs, strategyOutputs } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { isQuarantinedCluster } from "./pattern-engine-simple";

export interface Strategy {
  clusterId: string;
  strategyType: "escalate" | "monitor" | "log";
  action: string;
  priority: number;
  severity: "low" | "medium" | "high";
}

/**
 * Map severity to strategy
 */
function generateStrategy(
  clusterId: string,
  severity: "low" | "medium" | "high"
): Strategy {
  let strategyType: "escalate" | "monitor" | "log";
  let action: string;
  let priority: number;

  switch (severity) {
    case "high":
      strategyType = "escalate";
      action = "immediate_review";
      priority = 3;
      break;
    case "medium":
      strategyType = "monitor";
      action = "watch_pattern";
      priority = 2;
      break;
    case "low":
      strategyType = "log";
      action = "record_only";
      priority = 1;
      break;
  }

  return {
    clusterId,
    strategyType,
    action,
    priority,
    severity,
  };
}

/**
 * Generate strategies from patterns
 */
export async function runStrategyEngine(
  dbInstance: any = defaultDb
): Promise<Strategy[]> {
  console.log("[Strategy Engine] Starting strategy generation...");

  // Query only non-quarantined patterns from patternOutputs
  const patterns = await dbInstance
    .select()
    .from(patternOutputs)
    .where(eq(patternOutputs.isQuarantined, 0));

  console.log(`[Strategy Engine] Found ${patterns.length} non-quarantined patterns to process`);

  const strategies: Strategy[] = [];
  let guardSkipped = 0;

  for (const pattern of patterns) {
    // ── Quarantine Guard ──────────────────────────────────────────────────
    // Double-check cluster prefix even if is_quarantined flag was somehow missed
    if (isQuarantinedCluster(pattern.clusterId)) {
      guardSkipped++;
      console.log(`[Strategy Engine] GUARD: Skipping quarantined cluster ${pattern.clusterId}`);
      continue;
    }

    const strategy = generateStrategy(
      pattern.clusterId,
      pattern.severity as "low" | "medium" | "high"
    );

    strategies.push(strategy);

    console.log(
      `[Strategy Engine] Generated strategy for ${pattern.clusterId}: ${strategy.strategyType} (priority: ${strategy.priority})`
    );
  }

  if (guardSkipped > 0) {
    console.log(`[Strategy Engine] GUARD: Blocked ${guardSkipped} quarantined clusters`);
  }

  console.log(`[Strategy Engine] Total strategies: ${strategies.length}`);
  console.log(
    `[Strategy Engine] Priority breakdown: escalate=${strategies.filter((s) => s.priority === 3).length}, monitor=${strategies.filter((s) => s.priority === 2).length}, log=${strategies.filter((s) => s.priority === 1).length}`
  );

  // Persist strategies to strategyOutputs — only non-quarantined
  console.log(`[Strategy Engine] Persisting ${strategies.length} strategies to strategyOutputs...`);
  const now = Date.now();

  for (const strategy of strategies) {
    try {
      await dbInstance.execute(
        sql`
          INSERT INTO strategy_outputs (
            cluster_id, strategy_type, action, priority, created_at, updated_at
          ) VALUES (
            ${strategy.clusterId},
            ${strategy.strategyType},
            ${strategy.action},
            ${strategy.priority},
            ${now},
            ${now}
          )
          ON DUPLICATE KEY UPDATE
            strategy_type = VALUES(strategy_type),
            action = VALUES(action),
            priority = VALUES(priority),
            updated_at = VALUES(updated_at)
        `
      );
      console.log(
        `[Strategy Engine] Persisted strategy for ${strategy.clusterId}: ${strategy.strategyType}`
      );
    } catch (error) {
      console.error(`[Strategy Engine] Error persisting strategy for ${strategy.clusterId}:`, error);
    }
  }

  console.log(`[Strategy Engine] Persistence complete`);

  return strategies;
}

/**
 * Get strategy statistics
 */
export async function getStrategyStats(
  dbInstance: any = defaultDb
): Promise<{
  totalStrategies: number;
  escalate: number;
  monitor: number;
  log: number;
}> {
  const strategies = await runStrategyEngine(dbInstance);

  return {
    totalStrategies: strategies.length,
    escalate: strategies.filter((s) => s.priority === 3).length,
    monitor: strategies.filter((s) => s.priority === 2).length,
    log: strategies.filter((s) => s.priority === 1).length,
  };
}
