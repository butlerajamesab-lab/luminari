/**
 * Pattern Engine (Simple)
 * 
 * Clusters approved signals from signalRegistry into patterns.
 * Uses deterministic clustering based on clusterId and signal type.
 * 
 * No inference, no ML, deterministic only.
 */

import { db as defaultDb } from "./db";
import { signalRegistry, patternOutputs } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

// ─── Quarantine Guard ─────────────────────────────────────────────────────────
// Cluster prefixes that map to orphaned source signals — must never be processed.
// These correspond to legacy signal types that bypassed the Sunam gate.
const QUARANTINED_CLUSTER_PREFIXES = [
  'FORM_SIGNAL:',
  'REAL_DOCUMENT_SIGNAL:',
  'INGESTION_SIGNAL:',
];

export function isQuarantinedCluster(clusterId: string): boolean {
  return QUARANTINED_CLUSTER_PREFIXES.some(prefix => clusterId.startsWith(prefix));
}

export interface PatternCluster {
  clusterId: string;
  signalCount: number;
  signalTypes: string[];
  severity: "low" | "medium" | "high";
  signals: Array<{
    signalType: string;
    domain: string;
  }>;
}

export interface PatternOutput {
  clusterId: string;
  signalCount: number;
  signalTypes: string;
  severity: string;
  createdAt: Date;
}

/**
 * Generate deterministic clusterId from signal type and domain
 */
function generateClusterId(signalType: string, domain: string): string {
  const input = `${signalType}:${domain}`;
  return crypto.createHash("sha256").update(input).digest("hex").substring(0, 16);
}

/**
 * Determine severity based on signal count
 */
function calculateSeverity(count: number): "low" | "medium" | "high" {
  if (count >= 3) return "high";
  if (count === 2) return "medium";
  return "low";
}

/**
 * Cluster approved signals into patterns
 */
export async function runPatternEngine(
  dbInstance: any = defaultDb
): Promise<PatternCluster[]> {
  console.log("[Pattern Engine] Starting pattern clustering...");

  // Query all approved signals from registry
  const signals = await dbInstance
    .select()
    .from(signalRegistry)
    .where(eq(signalRegistry.routeToPatternEngine, true));

  console.log(`[Pattern Engine] Found ${signals.length} signals to cluster`);

  const clusters = new Map<string, PatternCluster>();
  let guardSkipped = 0;

  for (const signal of signals) {
    // Use existing clusterId or generate one
    let clusterId = signal.clusterId;
    if (!clusterId) {
      clusterId = generateClusterId(signal.signalType || "unknown", signal.domain || "default");
    }

    // ── Quarantine Guard ──────────────────────────────────────────────────
    // Skip any cluster whose ID maps to an orphaned (non-governed) source signal.
    // This prevents contamination from propagating into pattern → strategy → procedural chain.
    if (isQuarantinedCluster(clusterId)) {
      guardSkipped++;
      console.log(`[Pattern Engine] GUARD: Skipping quarantined cluster ${clusterId}`);
      continue;
    }

    // Initialize cluster if not exists
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, {
        clusterId: clusterId,
        signalCount: 0,
        signalTypes: [],
        severity: "low",
        signals: [],
      });
    }

    const cluster = clusters.get(clusterId)!;
    cluster.signalCount += 1;

    if (signal.signalType && !cluster.signalTypes.includes(signal.signalType)) {
      cluster.signalTypes.push(signal.signalType);
    }

    cluster.signals.push({
      signalType: signal.signalType || "unknown",
      domain: signal.domain || "default",
    });

    cluster.severity = calculateSeverity(cluster.signalCount);

    console.log(
      `[Pattern Engine] Cluster ${clusterId}: ${cluster.signalCount} signals, severity: ${cluster.severity}`
    );
  }

  if (guardSkipped > 0) {
    console.log(`[Pattern Engine] GUARD: Blocked ${guardSkipped} signals from quarantined clusters`);
  }

  const results = Array.from(clusters.values());

  console.log(`[Pattern Engine] Total clusters: ${results.length}`);
  console.log(
    `[Pattern Engine] Severity breakdown: high=${results.filter((c) => c.severity === "high").length}, medium=${results.filter((c) => c.severity === "medium").length}, low=${results.filter((c) => c.severity === "low").length}`
  );

  // Persist clusters to patternOutputs — only non-quarantined
  console.log(`[Pattern Engine] Persisting ${results.length} clusters to patternOutputs...`);
  const now = Date.now();

  for (const cluster of results) {
    try {
      await dbInstance.execute(
        sql`
          INSERT INTO pattern_outputs (
            cluster_id, signal_count, signal_types, severity, created_at, updated_at
          ) VALUES (
            ${cluster.clusterId},
            ${cluster.signalCount},
            ${JSON.stringify(cluster.signalTypes)},
            ${cluster.severity},
            ${now},
            ${now}
          )
          ON DUPLICATE KEY UPDATE
            signal_count = VALUES(signal_count),
            signal_types = VALUES(signal_types),
            severity = VALUES(severity),
            updated_at = VALUES(updated_at)
        `
      );
      console.log(`[Pattern Engine] Persisted cluster ${cluster.clusterId}: ${cluster.signalCount} signals, severity=${cluster.severity}`);
    } catch (error) {
      console.error(`[Pattern Engine] Error persisting cluster ${cluster.clusterId}:`, error);
    }
  }

  console.log(`[Pattern Engine] Persistence complete`);

  return results;
}

/**
 * Get pattern statistics
 */
export async function getPatternStats(
  dbInstance: any = defaultDb
): Promise<{
  totalClusters: number;
  totalSignals: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
}> {
  const clusters = await runPatternEngine(dbInstance);

  return {
    totalClusters: clusters.length,
    totalSignals: clusters.reduce((sum, c) => sum + c.signalCount, 0),
    highSeverity: clusters.filter((c) => c.severity === "high").length,
    mediumSeverity: clusters.filter((c) => c.severity === "medium").length,
    lowSeverity: clusters.filter((c) => c.severity === "low").length,
  };
}
