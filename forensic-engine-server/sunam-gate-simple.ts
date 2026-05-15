/**
 * Sunam Gate (Simple) — Signal Spine Gating
 * 
 * Minimal deterministic gate for signalFlags → signalRegistry routing.
 * No external tables, no parallel pipelines.
 * 
 * Flow:
 * 1. Read signalFlags where sunamStatus IS NULL or 'pending'
 * 2. Evaluate each signal using deterministic rules
 * 3. Update sunamStatus and confidenceScore
 * 4. If accepted: UPSERT into signalRegistry
 * 5. If rejected/deferred: skip registry
 */

import { eq, isNull, or } from "drizzle-orm";
import { signalFlags, signalRegistry } from "../drizzle/schema";

export interface SunamGateSimpleResult {
  signalFlagId: number;
  flagType: string;
  beforeStatus: string | null;
  afterStatus: "approved" | "rejected" | "deferred";
  confidenceScore: number;
  reason: string;
  registryCreated: boolean;
  registryId?: number;
}

/**
 * Deterministic evaluation rules for a signal
 */
function evaluateSignal(signal: {
  id: number;
  flagType: string | null;
  description: string | null;
  quoteId: number | null;
}): {
  status: "approved" | "rejected" | "deferred";
  confidenceScore: number;
  reason: string;
} {
  // Check required fields
  if (!signal.flagType) {
    return {
      status: "rejected",
      confidenceScore: 0,
      reason: "Missing flagType",
    };
  }

  if (!signal.description || signal.description.trim().length === 0) {
    return {
      status: "rejected",
      confidenceScore: 0.1,
      reason: "Empty description",
    };
  }

  const desc = signal.description.trim().toLowerCase();

  // APPROVE: Has all required fields + meaningful description
  if (signal.quoteId && desc.length >= 10) {
    return {
      status: "approved",
      confidenceScore: 0.85,
      reason: "Complete signal with quote reference",
    };
  }

  // DEFER: Has description but missing quote or too short
  if (desc.length >= 5 && desc.length < 10) {
    return {
      status: "deferred",
      confidenceScore: 0.5,
      reason: "Partial signal: description too brief",
    };
  }

  // APPROVE: Has description and flagType but no quote (still valuable)
  if (!signal.quoteId && desc.length >= 10) {
    return {
      status: "approved",
      confidenceScore: 0.6,
      reason: "Signal lacks quote reference",
    };
  }

  // REJECT: Insufficient data
  return {
    status: "rejected",
    confidenceScore: 0.2,
    reason: "Insufficient signal data",
  };
}

/**
 * Generate deterministic cluster ID for signal grouping
 */
function generateClusterId(signal: any): string {
  // Group by flagType + laneId for deduplication
  const base = `${signal.flagType}:${signal.laneId}`;
  return base;
}

/**
 * Process pending signals through Sunam gate
 * Updates signalFlags and creates/updates signalRegistry entries
 */
export async function runSunamGate(
  dbInstance: any,
  limit: number = 100,
  engineVersion?: string
): Promise<SunamGateSimpleResult[]> {
  // Fetch pending signals (where sunamStatus is NULL or 'pending')
  // Optionally filter by engineVersion for scoped processing
  let query = dbInstance
    .select()
    .from(signalFlags)
    .where(
      or(
        isNull(signalFlags.sunamStatus),
        eq(signalFlags.sunamStatus, "pending")
      )
    );

  // Add engineVersion filter if provided
  if (engineVersion) {
    query = query.where(eq(signalFlags.engineVersion, engineVersion));
  }

  const pendingSignals = await query.limit(limit);
  console.log(`[Sunam Gate] Found ${pendingSignals.length} pending signals${engineVersion ? ` (engineVersion: ${engineVersion})` : ""}`);

  const results: SunamGateSimpleResult[] = [];

  for (const signal of pendingSignals) {
    const beforeStatus = signal.sunamStatus;

    // Evaluate signal
    const { status, confidenceScore, reason } = evaluateSignal({
      id: signal.id,
      flagType: signal.flagType,
      description: signal.description,
      quoteId: signal.quoteId,
    });

    console.log(`[Sunam Gate] Processing signal ${signal.id}: ${signal.flagType}`);
    console.log(`[Sunam Gate]   Result: ${status} (confidence: ${confidenceScore})`);

    // Update signalFlags with decision
    await dbInstance
      .update(signalFlags)
      .set({
        sunamStatus: status,
        confidenceScore: confidenceScore,
      })
      .where(eq(signalFlags.id, signal.id));

    console.log(`[Sunam Gate]   Updated database: ${signal.id} → ${status}`);

    let registryCreated = false;
    let registryId: number | undefined;

    // If approved, create or update signalRegistry entry
    if (status === "approved") {
      const clusterId = generateClusterId(signal);

      // Check if registry entry exists
      const existing = await dbInstance
        .select()
        .from(signalRegistry)
        .where(eq(signalRegistry.signalType, signal.flagType))
        .limit(1);

      if (existing.length > 0) {
        // Update existing entry
        registryId = existing[0].id;
        await dbInstance
          .update(signalRegistry)
          .set({
            clusterId: clusterId,
            routeToPatternEngine: true,
            routeToStrategyEngine: false,
            routeToProceduralEngine: false,
            updatedAt: Date.now(),
          })
          .where(eq(signalRegistry.id, registryId));
        registryCreated = false; // Updated, not created
      } else {
        // Create new registry entry
        const insertResult = await dbInstance
          .insert(signalRegistry)
          .values({
            signalType: signal.flagType,
            domain: signal.laneId || "default",
            triggerPatterns: [signal.flagType],
            severity: confidenceScore > 0.8 ? "critical" : "high",
            explanation: reason,
            clusterId: clusterId,
            routeToPatternEngine: true,
            routeToStrategyEngine: false,
            routeToProceduralEngine: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });

        registryId = insertResult[0];
        registryCreated = true;
      }
    }

    results.push({
      signalFlagId: signal.id,
      flagType: signal.flagType,
      beforeStatus: beforeStatus,
      afterStatus: status,
      confidenceScore: confidenceScore,
      reason: reason,
      registryCreated: registryCreated,
      registryId: registryId,
    });
  }

  console.log(`[Sunam Gate] Total processed: ${results.length} signals`);
  console.log(`[Sunam Gate] Approved: ${results.filter((r) => r.afterStatus === "approved").length}`);
  console.log(`[Sunam Gate] Rejected: ${results.filter((r) => r.afterStatus === "rejected").length}`);
  console.log(`[Sunam Gate] Deferred: ${results.filter((r) => r.afterStatus === "deferred").length}`);

  return results;
}

/**
 * Get gate statistics
 */
export async function getSunamGateStats(dbInstance: any): Promise<{
  pending: number;
  accepted: number;
  rejected: number;
  deferred: number;
  registryCount: number;
}> {
  const [pendingCount] = await dbInstance
    .select({ count: dbInstance.fn.count(signalFlags.id) })
    .from(signalFlags)
    .where(
      or(
        isNull(signalFlags.sunamStatus),
        eq(signalFlags.sunamStatus, "pending")
      )
    );

  const [acceptedCount] = await dbInstance
    .select({ count: dbInstance.fn.count(signalFlags.id) })
    .from(signalFlags)
    .where(eq(signalFlags.sunamStatus, "accepted"));

  const [rejectedCount] = await dbInstance
    .select({ count: dbInstance.fn.count(signalFlags.id) })
    .from(signalFlags)
    .where(eq(signalFlags.sunamStatus, "rejected"));

  const [deferredCount] = await dbInstance
    .select({ count: dbInstance.fn.count(signalFlags.id) })
    .from(signalFlags)
    .where(eq(signalFlags.sunamStatus, "deferred"));

  const [registryCount] = await dbInstance
    .select({ count: dbInstance.fn.count(signalRegistry.id) })
    .from(signalRegistry);

  return {
    pending: pendingCount?.count || 0,
    accepted: acceptedCount?.count || 0,
    rejected: rejectedCount?.count || 0,
    deferred: deferredCount?.count || 0,
    registryCount: registryCount?.count || 0,
  };
}
