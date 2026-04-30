/**
 * Live Signal Emitter
 * 
 * Single shared module for emitting typed behavioral signals into live_signals.
 * 
 * Signal flow: Emitter → live_signals → Sunam gate → detected_signals → engines
 * 
 * DO NOT read from live_signals in engines. This module only writes.
 * All reads by engines must go through detected_signals (post-Sunam gate).
 * 
 * Effect types:
 *   RESOURCE_STALE       → penalty in support matcher, block in transmission
 *   PATH_INVALID         → block enforcement action path queries
 *   DEADLINE_APPROACHING → override in transmission (urgent send allowed)
 *   POLICY_CHANGE        → boost in support matcher
 *   STREAM_ANOMALY       → anomaly detected in ingestion stream
 *   ENTITY_RISK          → entity risk pattern detected
 */
import { db } from "./db";
import { liveSignals } from "../drizzle/schema";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";

export type EffectType =
  | "RESOURCE_STALE"
  | "PATH_INVALID"
  | "DEADLINE_APPROACHING"
  | "POLICY_CHANGE"
  | "STREAM_ANOMALY"
  | "ENTITY_RISK";

export interface EmitSignalOptions {
  effectType: EffectType;
  // What triggered this signal
  targetTable: string;    // e.g. "unified_resources", "enforcement_action_paths"
  targetId: number;       // row ID in targetTable
  // Signal metadata
  signalType: string;     // e.g. "RESOURCE_STALE:unified_resources"
  title: string;
  explanation: string;
  severity: "critical" | "high" | "medium" | "low";
  // Context
  jurisdiction: string;   // state code or "federal"
  domain: string;         // housing, employment, etc.
  datasetId?: string;     // which dataset triggered this (if stream-derived)
  sourceUrl?: string;     // canonical URL of the source record
  sourceTimestamp?: number; // when the source event occurred (ms)
  // Optional: deadline info
  deadlineDays?: number;  // for DEADLINE_APPROACHING signals
}

/**
 * Emit a typed signal into live_signals.
 * Idempotent: will not create a duplicate if an active signal with the same
 * fingerprint already exists.
 * 
 * Returns the signal ID if created, null if deduplicated.
 */
export async function emitSignal(opts: EmitSignalOptions): Promise<number | null> {
  const now = Date.now();
  
  // Fingerprint: hash of effectType + targetTable + targetId + jurisdiction
  // This ensures one active signal per (effect, target, jurisdiction) combination
  const fingerprintInput = `${opts.effectType}:${opts.targetTable}:${opts.targetId}:${opts.jurisdiction}`;
  const signalFingerprint = crypto
    .createHash("sha256")
    .update(fingerprintInput)
    .digest("hex")
    .slice(0, 64);

  // Check for existing active signal with same fingerprint
  const existing = await db
    .select({ id: liveSignals.id })
    .from(liveSignals)
    .where(
      and(
        eq(liveSignals.signalFingerprint, signalFingerprint),
        eq(liveSignals.active, true)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return null; // Already active, skip
  }

  const [result] = await db.insert(liveSignals).values({
    signalType: opts.signalType,
    datasetId: opts.datasetId ?? "system",
    jurisdiction: opts.jurisdiction,
    domain: opts.domain,
    severity: opts.severity,
    title: opts.title,
    explanation: opts.explanation,
    patternSummary: `${opts.effectType} detected for ${opts.targetTable}#${opts.targetId}`,
    supportingStatistics: {
      recordsAnalyzed: 1,
      patternCount: 1,
      percentageAffected: 100,
      timeRange: { from: now - 86400000, to: now },
      jurisdictionsAffected: [opts.jurisdiction],
      dataSource: opts.targetTable,
      additionalMetrics: opts.deadlineDays !== undefined
        ? { deadlineDays: opts.deadlineDays }
        : {},
    },
    confidenceScore: "0.9500",
    detectedAt: now,
    signalFingerprint,
    active: true,
    // Gating fields
    effectType: opts.effectType,
    targetTable: opts.targetTable,
    targetId: opts.targetId,
    sourceUrl: opts.sourceUrl ?? null,
    sourceTimestamp: opts.sourceTimestamp ?? now,
  });

  // @ts-ignore - insertId exists on mysql2 result
  return result?.insertId ?? null;
}

/**
 * Deactivate all active signals for a specific target.
 * Call this when the condition that triggered the signal is resolved
 * (e.g., resource re-verified, path re-activated).
 */
export async function resolveSignalsForTarget(
  targetTable: string,
  targetId: number,
  effectType?: EffectType
): Promise<number> {
  const conditions = [
    eq(liveSignals.targetTable, targetTable),
    eq(liveSignals.targetId, targetId),
    eq(liveSignals.active, true),
  ];
  
  if (effectType) {
    conditions.push(eq(liveSignals.effectType, effectType));
  }

  const result = await db
    .update(liveSignals)
    .set({ active: false })
    // @ts-ignore
    .where(and(...conditions));

  // @ts-ignore
  return result?.[0]?.affectedRows ?? 0;
}

/**
 * Query active signals for a specific target.
 * Used by matching engine and transmission layer to check gating.
 */
export async function getActiveSignalsForTarget(
  targetTable: string,
  targetId: number,
  effectType?: EffectType
): Promise<Array<{
  id: number;
  effectType: string | null;
  severity: string;
  title: string;
  explanation: string;
  detectedAt: number;
}>> {
  const conditions = [
    eq(liveSignals.targetTable, targetTable),
    eq(liveSignals.targetId, targetId),
    eq(liveSignals.active, true),
  ];
  
  if (effectType) {
    conditions.push(eq(liveSignals.effectType, effectType));
  }

  const rows = await db
    .select({
      id: liveSignals.id,
      effectType: liveSignals.effectType,
      severity: liveSignals.severity,
      title: liveSignals.title,
      explanation: liveSignals.explanation,
      detectedAt: liveSignals.detectedAt,
    })
    .from(liveSignals)
    // @ts-ignore
    .where(and(...conditions))
    .limit(10);

  return rows;
}

/**
 * Query active signals by effect type across all targets.
 * Used by the matching engine to get all RESOURCE_STALE/POLICY_CHANGE signals.
 */
export async function getActiveSignalsByEffect(
  effectType: EffectType,
  limit = 100
): Promise<Array<{
  id: number;
  targetTable: string | null;
  targetId: number | null;
  severity: string;
  title: string;
  jurisdiction: string;
  domain: string;
  detectedAt: number;
}>> {
  const rows = await db
    .select({
      id: liveSignals.id,
      targetTable: liveSignals.targetTable,
      targetId: liveSignals.targetId,
      severity: liveSignals.severity,
      title: liveSignals.title,
      jurisdiction: liveSignals.jurisdiction,
      domain: liveSignals.domain,
      detectedAt: liveSignals.detectedAt,
    })
    .from(liveSignals)
    .where(
      and(
        eq(liveSignals.effectType, effectType),
        eq(liveSignals.active, true)
      )
    )
    .limit(limit);

  return rows;
}
