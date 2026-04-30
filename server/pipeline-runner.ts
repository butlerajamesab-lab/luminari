/**
 * Automatic Pipeline Runner
 * 
 * Orchestrates full signal processing pipeline on 5-minute interval.
 * Runs: Ingest → Gate → Pattern → Strategy → Procedural → Activation
 */

import { db } from "./db";
import { runComplaintsStream } from "./streams/complaints-stream";
import { runSunamGate } from "./sunam-gate-simple";
import { runPatternEngine } from "./pattern-engine-simple";
import { runStrategyEngine } from "./strategy-engine-simple";
import { runProceduralEngine } from "./procedural-engine-simple";
import { runActivationEngine } from "./procedural-activation";

export interface PipelineStats {
  timestamp: string;
  ingestedSignals: number;
  gatedSignals: number;
  patterns: number;
  strategies: number;
  procedures: number;
  activations: number;
  duration: number;
  errors: string[];
}

let isRunning = false;
let lastRun: PipelineStats | null = null;

/**
 * Run full pipeline end-to-end
 */
export async function runFullPipeline(): Promise<PipelineStats> {
  const startTime = Date.now();
  const stats: PipelineStats = {
    timestamp: new Date().toISOString(),
    ingestedSignals: 0,
    gatedSignals: 0,
    patterns: 0,
    strategies: 0,
    procedures: 0,
    activations: 0,
    duration: 0,
    errors: [],
  };

  // Prevent concurrent runs
  if (isRunning) {
    console.log("[Pipeline] Pipeline already running, skipping this cycle");
    return stats;
  }

  isRunning = true;
  console.log("[Pipeline] ═══════════════════════════════════════════════════════");
  console.log(`[Pipeline] Starting full pipeline run at ${stats.timestamp}`);
  console.log("[Pipeline] ═══════════════════════════════════════════════════════");

  try {
    // STEP 1: Ingest complaints
    console.log("\n[Pipeline] STEP 1: Ingesting complaints...");
    try {
      const ingestStats = await runComplaintsStream(db);
      stats.ingestedSignals = ingestStats.inserted;
      console.log(
        `[Pipeline] ✓ Ingestion complete: fetched=${ingestStats.fetched}, inserted=${ingestStats.inserted}, skipped=${ingestStats.skipped}`
      );
    } catch (error) {
      const msg = `Ingestion failed: ${error}`;
      console.error(`[Pipeline] ✗ ${msg}`);
      stats.errors.push(msg);
    }

    // STEP 2: Run Sunam Gate
    console.log("\n[Pipeline] STEP 2: Running Sunam Gate...");
    try {
      const gateResults = await runSunamGate(db);
      stats.gatedSignals = gateResults.length;
      const approved = gateResults.filter((r) => r.status === "approved").length;
      const rejected = gateResults.filter((r) => r.status === "rejected").length;
      const deferred = gateResults.filter((r) => r.status === "deferred").length;
      console.log(
        `[Pipeline] ✓ Gate complete: processed=${gateResults.length}, approved=${approved}, rejected=${rejected}, deferred=${deferred}`
      );
    } catch (error) {
      const msg = `Gate failed: ${error}`;
      console.error(`[Pipeline] ✗ ${msg}`);
      stats.errors.push(msg);
    }

    // STEP 3: Run Pattern Engine
    console.log("\n[Pipeline] STEP 3: Running Pattern Engine...");
    try {
      const patterns = await runPatternEngine(db);
      stats.patterns = patterns.length;
      console.log(`[Pipeline] ✓ Pattern engine complete: generated=${patterns.length}`);
    } catch (error) {
      const msg = `Pattern engine failed: ${error}`;
      console.error(`[Pipeline] ✗ ${msg}`);
      stats.errors.push(msg);
    }

    // STEP 4: Run Strategy Engine
    console.log("\n[Pipeline] STEP 4: Running Strategy Engine...");
    try {
      const strategies = await runStrategyEngine(db);
      stats.strategies = strategies.length;
      console.log(`[Pipeline] ✓ Strategy engine complete: generated=${strategies.length}`);
    } catch (error) {
      const msg = `Strategy engine failed: ${error}`;
      console.error(`[Pipeline] ✗ ${msg}`);
      stats.errors.push(msg);
    }

    // STEP 5: Run Procedural Engine
    console.log("\n[Pipeline] STEP 5: Running Procedural Engine...");
    try {
      const procedures = await runProceduralEngine(db);
      stats.procedures = procedures.length;
      console.log(`[Pipeline] ✓ Procedural engine complete: generated=${procedures.length}`);
    } catch (error) {
      const msg = `Procedural engine failed: ${error}`;
      console.error(`[Pipeline] ✗ ${msg}`);
      stats.errors.push(msg);
    }

    // STEP 6: Run Activation Engine
    console.log("\n[Pipeline] STEP 6: Running Activation Engine...");
    try {
      const activations = await runActivationEngine(db);
      stats.activations = activations.length;
      console.log(`[Pipeline] ✓ Activation engine complete: generated=${activations.length}`);
    } catch (error) {
      const msg = `Activation engine failed: ${error}`;
      console.error(`[Pipeline] ✗ ${msg}`);
      stats.errors.push(msg);
    }

    // Calculate duration
    stats.duration = Date.now() - startTime;

    // Log summary
    console.log("\n[Pipeline] ═══════════════════════════════════════════════════════");
    console.log("[Pipeline] PIPELINE RUN SUMMARY");
    console.log("[Pipeline] ═══════════════════════════════════════════════════════");
    console.log(`[Pipeline] Timestamp: ${stats.timestamp}`);
    console.log(`[Pipeline] Ingested Signals: ${stats.ingestedSignals}`);
    console.log(`[Pipeline] Gated Signals: ${stats.gatedSignals}`);
    console.log(`[Pipeline] Patterns: ${stats.patterns}`);
    console.log(`[Pipeline] Strategies: ${stats.strategies}`);
    console.log(`[Pipeline] Procedures: ${stats.procedures}`);
    console.log(`[Pipeline] Activations: ${stats.activations}`);
    console.log(`[Pipeline] Duration: ${stats.duration}ms`);
    if (stats.errors.length > 0) {
      console.log(`[Pipeline] Errors: ${stats.errors.length}`);
      stats.errors.forEach((err) => console.log(`  - ${err}`));
    } else {
      console.log("[Pipeline] Errors: None");
    }
    console.log("[Pipeline] ═══════════════════════════════════════════════════════\n");

    lastRun = stats;
  } finally {
    isRunning = false;
  }

  return stats;
}

/**
 * Get last pipeline run statistics
 */
export function getLastPipelineRun(): PipelineStats | null {
  return lastRun;
}

/**
 * Start pipeline runner on interval
 */
export function startPipelineRunner(intervalMs: number = 5 * 60 * 1000): NodeJS.Timer {
  console.log(
    `[Pipeline] Starting automatic pipeline runner with ${intervalMs / 1000}s interval`
  );

  // Run immediately on startup
  runFullPipeline().catch((error) => {
    console.error("[Pipeline] Error in initial pipeline run:", error);
  });

  // Run on interval
  const intervalId = setInterval(() => {
    runFullPipeline().catch((error) => {
      console.error("[Pipeline] Error in scheduled pipeline run:", error);
    });
  }, intervalMs);

  return intervalId;
}

/**
 * Stop pipeline runner
 */
export function stopPipelineRunner(intervalId: NodeJS.Timer): void {
  console.log("[Pipeline] Stopping pipeline runner");
  clearInterval(intervalId);
}
