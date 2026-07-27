/**
 * Executor Service — Engine Patch Execution Layer
 * 
 * Provides a unified execution framework for system mutations:
 * 1. Engine patches: modify engine config, version, description, category
 * 2. Stream patches: modify stream config, apiUrl, fieldMapping, weights
 * 3. Schema patches: DDL migrations with rollback
 * 4. Config patches: system configuration changes
 * 
 * Every execution follows: generate → diff → impact analysis → approve → apply → log → rollback artifact
 */

import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  engineRegistry,
  dataStreamRegistry,
  copilotArtifacts,
  copilotExecutions,
  copilotImpactAnalyses,
} from "../../drizzle/schema";
import {
  get_admin_change_log_entry,
  list_admin_change_log,
  mark_admin_change_rolled_back,
  write_admin_change_log,
} from "./admin-change-log-store";

// ─── Types ───

export interface PatchOperation {
  type: "engine_patch" | "stream_patch" | "schema_patch" | "config_patch";
  targetId: string;
  description: string;
  changes: Record<string, { from: any; to: any }>;
  sql?: string;
  rollbackSql?: string;
}

export interface PatchResult {
  success: boolean;
  patchId: number;
  summary: string;
  changesApplied: number;
  rollbackAvailable: boolean;
  error?: string;
}

export interface ExecutionLogEntry {
  id: number;
  patchType: string;
  targetId: string;
  description: string;
  status: "applied" | "rolled_back" | "failed";
  changesApplied: number;
  executedBy: string;
  executedAt: number;
  rollbackAvailable: boolean;
}

// ─── Diff Generator ───

export function generateDiff(
  current: Record<string, any>,
  proposed: Record<string, any>,
  fields: string[]
): Record<string, { from: any; to: any }> {
  const diff: Record<string, { from: any; to: any }> = {};
  for (const field of fields) {
    if (proposed[field] !== undefined && JSON.stringify(current[field]) !== JSON.stringify(proposed[field])) {
      diff[field] = { from: current[field], to: proposed[field] };
    }
  }
  return diff;
}

// ─── Impact Analysis ───

export function analyzeImpact(patch: PatchOperation): {
  riskLevel: "low" | "medium" | "high" | "critical";
  affectedSystems: string[];
  rollbackComplexity: "simple" | "moderate" | "complex";
  warnings: string[];
} {
  const warnings: string[] = [];
  const affectedSystems: string[] = [];
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let rollbackComplexity: "simple" | "moderate" | "complex" = "simple";

  if (patch.type === "engine_patch") {
    affectedSystems.push("engine_registry");
    if (patch.changes.enabled) {
      riskLevel = "medium";
      warnings.push("Enabling/disabling an engine affects the processing pipeline");
      affectedSystems.push("ingestion_pipeline", "signal_detection");
    }
    if (patch.changes.configJson) {
      riskLevel = "medium";
      warnings.push("Engine config changes may affect signal detection behavior");
    }
  }

  if (patch.type === "stream_patch") {
    affectedSystems.push("data_stream_registry");
    if (patch.changes.apiUrl) {
      riskLevel = "medium";
      warnings.push("Changing API URL will affect next ingestion run");
      affectedSystems.push("ingestion_pipeline");
    }
    if (patch.changes.fieldMapping) {
      riskLevel = "high";
      warnings.push("Field mapping changes may cause data normalization issues");
      rollbackComplexity = "moderate";
    }
    if (patch.changes.signalWeight) {
      affectedSystems.push("signal_scoring");
    }
  }

  if (patch.type === "schema_patch") {
    affectedSystems.push("database");
    riskLevel = "high";
    rollbackComplexity = "moderate";
    if (patch.sql?.toUpperCase().includes("DROP")) {
      riskLevel = "critical";
      rollbackComplexity = "complex";
      warnings.push("DROP operations are destructive and may cause data loss");
    }
    if (patch.sql?.toUpperCase().includes("ALTER")) {
      warnings.push("ALTER TABLE may lock the table during execution");
    }
  }

  if (patch.type === "config_patch") {
    affectedSystems.push("system_config");
    if (patch.changes.autoDisableThreshold || patch.changes.maxRetries) {
      warnings.push("Changing self-healing thresholds affects all streams");
    }
  }

  return { riskLevel, affectedSystems, rollbackComplexity, warnings };
}

// ─── Engine Patch Execution ───

export async function applyEnginePatch(
  engineId: string,
  updates: {
    engineName?: string;
    description?: string;
    category?: string;
    version?: string;
    configJson?: Record<string, any>;
    enabled?: boolean;
    sortOrder?: number;
  },
  executedBy: string,
  executedByName?: string
): Promise<PatchResult> {
  // 1. Get current state
  const [current] = await db.select().from(engineRegistry)
    .where(eq(engineRegistry.engineId, engineId)).limit(1);

  if (!current) {
    return { success: false, patchId: 0, summary: `Engine ${engineId} not found`, changesApplied: 0, rollbackAvailable: false, error: "Engine not found" };
  }

  // 2. Generate diff
  const diff = generateDiff(current, updates, Object.keys(updates));
  if (Object.keys(diff).length === 0) {
    return { success: false, patchId: 0, summary: "No changes detected", changesApplied: 0, rollbackAvailable: false, error: "No changes" };
  }

  // 3. Build patch operation
  const patch: PatchOperation = {
    type: "engine_patch",
    targetId: engineId,
    description: `Update engine ${engineId}: ${Object.keys(diff).join(", ")}`,
    changes: diff,
  };

  // 4. Impact analysis
  const impact = analyzeImpact(patch);

  // 5. Apply changes
  try {
    const setValues: any = { updatedAt: Date.now() };
    if (updates.engineName !== undefined) setValues.engineName = updates.engineName;
    if (updates.description !== undefined) setValues.description = updates.description;
    if (updates.category !== undefined) setValues.category = updates.category;
    if (updates.version !== undefined) setValues.version = updates.version;
    if (updates.configJson !== undefined) setValues.configJson = updates.configJson;
    if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
    if (updates.sortOrder !== undefined) setValues.sortOrder = updates.sortOrder;

    await db.update(engineRegistry).set(setValues).where(eq(engineRegistry.engineId, engineId));

    // 6. Log the change with rollback data
    const logEntry = await write_admin_change_log({
      adminId: executedBy,
      adminName: executedByName,
      actionType: "engine_patch",
      targetSystem: "engine_registry",
      targetId: engineId,
      description: patch.description,
      previousState: current,
      newState: { ...current, ...setValues },
      rollbackAvailable: true,
      rollbackData: { type: "engine_patch", engineId, previousValues: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.from])) },
      timestamp: new Date(),
    });

    const patchId = logEntry.id;

    return {
      success: true,
      patchId,
      summary: `Engine ${engineId} updated: ${Object.keys(diff).map(k => `${k}: ${JSON.stringify(diff[k].from)} → ${JSON.stringify(diff[k].to)}`).join(", ")}`,
      changesApplied: Object.keys(diff).length,
      rollbackAvailable: true,
    };
  } catch (err: any) {
    return { success: false, patchId: 0, summary: `Failed to apply engine patch: ${err.message}`, changesApplied: 0, rollbackAvailable: false, error: err.message };
  }
}

// ─── Stream Patch Execution ───

export async function applyStreamPatch(
  streamId: string,
  updates: {
    streamName?: string;
    apiUrl?: string;
    sourceUrl?: string;
    fieldMapping?: Record<string, string>;
    cronExpression?: string;
    signalWeight?: number;
    confidenceMultiplier?: number;
    enabled?: boolean;
    postProcessingEngineName?: string;
    parserMode?: string;
  },
  executedBy: string,
  executedByName?: string
): Promise<PatchResult> {
  const [current] = await db.select().from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.streamId, streamId)).limit(1);

  if (!current) {
    return { success: false, patchId: 0, summary: `Stream ${streamId} not found`, changesApplied: 0, rollbackAvailable: false, error: "Stream not found" };
  }

  const diff = generateDiff(current, updates, Object.keys(updates));
  if (Object.keys(diff).length === 0) {
    return { success: false, patchId: 0, summary: "No changes detected", changesApplied: 0, rollbackAvailable: false, error: "No changes" };
  }

  const patch: PatchOperation = {
    type: "stream_patch",
    targetId: streamId,
    description: `Update stream ${streamId}: ${Object.keys(diff).join(", ")}`,
    changes: diff,
  };

  const impact = analyzeImpact(patch);

  try {
    const setValues: any = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) setValues[key] = value;
    }

    await db.update(dataStreamRegistry).set(setValues).where(eq(dataStreamRegistry.streamId, streamId));

    const logEntry = await write_admin_change_log({
      adminId: executedBy,
      adminName: executedByName,
      actionType: "stream_patch",
      targetSystem: "data_stream_registry",
      targetId: streamId,
      description: patch.description,
      previousState: current,
      newState: { ...current, ...setValues },
      rollbackAvailable: true,
      rollbackData: { type: "stream_patch", streamId, previousValues: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.from])) },
      timestamp: new Date(),
    });

    const patchId = logEntry.id;

    return {
      success: true,
      patchId,
      summary: `Stream ${streamId} updated: ${Object.keys(diff).map(k => `${k}: ${JSON.stringify(diff[k].from)} → ${JSON.stringify(diff[k].to)}`).join(", ")}`,
      changesApplied: Object.keys(diff).length,
      rollbackAvailable: true,
    };
  } catch (err: any) {
    return { success: false, patchId: 0, summary: `Failed to apply stream patch: ${err.message}`, changesApplied: 0, rollbackAvailable: false, error: err.message };
  }
}

// ─── Schema Patch Execution ───

export async function applySchemaPatch(
  sqlStatement: string,
  rollbackSql: string | null,
  description: string,
  executedBy: string,
  executedByName?: string
): Promise<PatchResult> {
  const patch: PatchOperation = {
    type: "schema_patch",
    targetId: "database",
    description,
    changes: { sql: { from: null, to: sqlStatement } },
    sql: sqlStatement,
    rollbackSql: rollbackSql ?? undefined,
  };

  const impact = analyzeImpact(patch);

  try {
    const result = await db.execute(sql.raw(sqlStatement));
    const affectedRows = Number((result as any).rowCount ?? 0);

    const logEntry = await write_admin_change_log({
      adminId: executedBy,
      adminName: executedByName,
      actionType: "migration_run",
      targetSystem: "database",
      targetId: "schema",
      description: `${description} (${affectedRows} rows affected)`,
      newState: { sql: sqlStatement, affectedRows },
      rollbackAvailable: !!rollbackSql,
      rollbackData: rollbackSql ? { type: "schema_patch", sql: rollbackSql } : null,
      timestamp: new Date(),
    });

    const patchId = logEntry.id;

    return {
      success: true,
      patchId,
      summary: `Schema patch applied: ${affectedRows} rows affected`,
      changesApplied: 1,
      rollbackAvailable: !!rollbackSql,
    };
  } catch (err: any) {
    return { success: false, patchId: 0, summary: `Schema patch failed: ${err.message}`, changesApplied: 0, rollbackAvailable: false, error: err.message };
  }
}

// ─── Rollback Engine/Stream Patch ───

export async function rollbackPatch(changeId: number, executedBy: string, executedByName?: string): Promise<{ success: boolean; summary: string }> {
  const change = await get_admin_change_log_entry(changeId);

  if (!change) return { success: false, summary: "Change not found" };
  if (!change.rollbackAvailable || change.rolledBack) return { success: false, summary: "Rollback not available" };

  const rollbackData = change.rollbackData as any;
  if (!rollbackData) return { success: false, summary: "No rollback data" };

  try {
    if (rollbackData.type === "engine_patch") {
      const setValues: any = { updatedAt: Date.now(), ...rollbackData.previousValues };
      await db.update(engineRegistry).set(setValues).where(eq(engineRegistry.engineId, rollbackData.engineId));
    } else if (rollbackData.type === "stream_patch") {
      const setValues: any = { updatedAt: Date.now(), ...rollbackData.previousValues };
      await db.update(dataStreamRegistry).set(setValues).where(eq(dataStreamRegistry.streamId, rollbackData.streamId));
    } else if (rollbackData.type === "schema_patch") {
      await db.execute(sql.raw(rollbackData.sql));
    } else {
      return { success: false, summary: `Unknown rollback type: ${rollbackData.type}` };
    }

    await mark_admin_change_rolled_back(changeId);

    // Log the rollback itself
    // @ts-ignore pre-existing type mismatch
    await write_admin_change_log({
      adminId: executedBy,
      adminName: executedByName,
      actionType: "rollback",
      targetSystem: change.targetSystem,
      targetId: change.targetId,
      description: `Rolled back: ${change.description}`,
      previousState: change.newState,
      newState: change.previousState,
      rollbackAvailable: false,
      timestamp: new Date(),
    });

    return { success: true, summary: `Rolled back: ${change.description}` };
  } catch (err: any) {
    return { success: false, summary: `Rollback failed: ${err.message}` };
  }
}

// ─── Execution Log ───

export async function getExecutionLog(limit = 50): Promise<ExecutionLogEntry[]> {
  const changes = await list_admin_change_log(limit);

  // @ts-ignore pre-existing type mismatch
  return changes.map(c => ({
    id: c.id,
    patchType: c.actionType,
    targetId: c.targetId ?? "unknown",
    description: c.description ?? "",
    status: c.rolledBack ? "rolled_back" as const : "applied" as const,
    changesApplied: 1,
    executedBy: c.adminName ?? c.adminId,
    executedAt: Number(c.timestamp),
    rollbackAvailable: c.rollbackAvailable && !c.rolledBack,
  }));
}

// ─── Force Re-ingestion (bypass checkpoint) ───

export async function resetStreamCheckpoint(streamId: string, executedBy: string, executedByName?: string): Promise<{ success: boolean; summary: string }> {
  const [stream] = await db.select().from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.streamId, streamId)).limit(1);

  if (!stream) return { success: false, summary: `Stream ${streamId} not found` };

  const previousCheckpoint = stream.lastIngestedAt;

  await db.update(dataStreamRegistry)
    .set({
      lastIngestedAt: null,
      updatedAt: Date.now(),
    })
    .where(eq(dataStreamRegistry.streamId, streamId));

  await write_admin_change_log({
    adminId: executedBy,
    adminName: executedByName,
    actionType: "checkpoint_reset",
    targetSystem: "data_stream_registry",
    targetId: streamId,
    description: `Reset ingestion checkpoint for ${streamId}. Previous checkpoint: ${previousCheckpoint ? new Date(Number(previousCheckpoint)).toISOString() : "none"}`,
    previousState: { lastIngestedAt: previousCheckpoint },
    newState: { lastIngestedAt: null },
    rollbackAvailable: true,
    rollbackData: { type: "stream_patch", streamId, previousValues: { lastIngestedAt: previousCheckpoint } },
    timestamp: new Date(),
  });

  return { success: true, summary: `Checkpoint reset for ${streamId}. Next ingestion will fetch all records.` };
}
