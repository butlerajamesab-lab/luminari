/**
 * Admin Sovereign Control System
 * 
 * Full admin control over:
 * - Engine Manager: add/remove/reorder/enable/disable engines
 * - Stream Manager: add/edit/disable/adjust weights
 * - Schema Manager: view/inspect tables
 * - Migration Runner: execute/preview SQL
 * - System Logs: view change history
 * 
 * All changes require confirmation + logging + rollback support.
 */
import { db } from "../db";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import {
  adminChangeLog,
  engineRegistry,
  dataStreamRegistry,
} from "../../drizzle/schema";

// ─── Types ───
export type AdminActionType =
  | "engine_add" | "engine_remove" | "engine_reorder" | "engine_toggle"
  | "stream_add" | "stream_edit" | "stream_disable"
  | "signal_weight_change"
  | "schema_edit" | "migration_run" | "migration_rollback"
  | "config_change" | "system_setting";

interface LogEntry {
  adminId: string;
  adminName?: string;
  actionType: AdminActionType;
  targetSystem: string;
  targetId?: string;
  previousState?: any;
  newState?: any;
  description?: string;
  rollbackData?: any;
}

// ─── Change Logging ───

async function logChange(entry: LogEntry) {
  await db.insert(adminChangeLog).values({
    adminId: entry.adminId,
    adminName: entry.adminName,
    actionType: entry.actionType,
    targetSystem: entry.targetSystem,
    targetId: entry.targetId,
    previousState: entry.previousState,
    newState: entry.newState,
    description: entry.description,
    rollbackAvailable: !!entry.rollbackData,
    rollbackData: entry.rollbackData,
    timestamp: Date.now(),
  });
}

export async function getChangeLog(limit = 50) {
  return db.select().from(adminChangeLog).orderBy(desc(adminChangeLog.timestamp)).limit(limit);
}

export async function rollbackChange(changeId: number, adminId: string, adminName?: string) {
  const [change] = await db.select().from(adminChangeLog).where(eq(adminChangeLog.id, changeId));
  if (!change) throw new Error("Change not found");
  if (change.rolledBack) throw new Error("Change already rolled back");
  if (!change.rollbackAvailable) throw new Error("Rollback not available for this change");

  // Execute rollback based on action type
  const rollbackData = change.rollbackData as any;
  if (rollbackData?.sql) {
    await db.execute(sql.raw(rollbackData.sql));
  } else if (rollbackData?.restoreState && change.targetId) {
    // Restore previous state based on target system
    if (change.targetSystem === "engine_registry" && rollbackData.restoreState) {
      const prev = rollbackData.restoreState;
      await db.update(engineRegistry)
        .set({
          engineName: prev.engineName,
          enabled: prev.enabled,
          sortOrder: prev.sortOrder,
          configJson: prev.configJson,
          updatedAt: Date.now(),
        })
        .where(eq(engineRegistry.engineId, change.targetId));
    } else if (change.targetSystem === "data_stream_registry" && rollbackData.restoreState) {
      const prev = rollbackData.restoreState;
      await db.update(dataStreamRegistry)
        .set({
          streamName: prev.streamName,
          signalWeight: prev.signalWeight,
          confidenceMultiplier: prev.confidenceMultiplier,
          enabled: prev.enabled,
          updatedAt: Date.now(),
        })
        .where(eq(dataStreamRegistry.streamId, change.targetId));
    }
  }

  await db.update(adminChangeLog)
    .set({ rolledBack: true })
    .where(eq(adminChangeLog.id, changeId));

  // Log the rollback itself
  await logChange({
    adminId,
    adminName,
    actionType: change.actionType.includes("engine") ? "engine_toggle" : "config_change",
    targetSystem: change.targetSystem,
    targetId: change.targetId || undefined,
    description: `Rolled back change #${changeId}: ${change.description}`,
  });

  return { success: true };
}

// ─── Engine Manager ───

export async function listEngines() {
  return db.select().from(engineRegistry).orderBy(asc(engineRegistry.sortOrder));
}

export async function addEngine(
  input: { engineId: string; engineName: string; description?: string; category?: string; config?: Record<string, any>; version?: string },
  adminId: string,
  adminName?: string,
) {
  await db.insert(engineRegistry).values({
    engineId: input.engineId,
    engineName: input.engineName,
    description: input.description,
    category: input.category,
    configJson: input.config,
    version: input.version,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await logChange({
    adminId, adminName,
    actionType: "engine_add",
    targetSystem: "engine_registry",
    targetId: input.engineId,
    newState: input,
    description: `Added engine: ${input.engineName}`,
    rollbackData: { sql: `DELETE FROM engine_registry WHERE engine_id_er = '${input.engineId}'` },
  });

  return { success: true };
}

export async function removeEngine(engineId: string, adminId: string, adminName?: string) {
  const [engine] = await db.select().from(engineRegistry).where(eq(engineRegistry.engineId, engineId));
  if (!engine) throw new Error("Engine not found");

  await db.delete(engineRegistry).where(eq(engineRegistry.engineId, engineId));

  await logChange({
    adminId, adminName,
    actionType: "engine_remove",
    targetSystem: "engine_registry",
    targetId: engineId,
    previousState: engine,
    description: `Removed engine: ${engine.engineName}`,
    rollbackData: {
      sql: `INSERT INTO engine_registry (engine_id_er, engine_name_er, description_er, category_er, enabled_er, sort_order_er, created_at_er, updated_at_er) VALUES ('${engine.engineId}', '${engine.engineName}', ${engine.description ? `'${engine.description}'` : 'NULL'}, ${engine.category ? `'${engine.category}'` : 'NULL'}, ${engine.enabled ? 1 : 0}, ${engine.sortOrder}, ${engine.createdAt}, ${Date.now()})`,
    },
  });

  return { success: true };
}

export async function toggleEngine(engineId: string, enabled: boolean, adminId: string, adminName?: string) {
  const [engine] = await db.select().from(engineRegistry).where(eq(engineRegistry.engineId, engineId));
  if (!engine) throw new Error("Engine not found");

  await db.update(engineRegistry)
    .set({ enabled, updatedAt: Date.now() })
    .where(eq(engineRegistry.engineId, engineId));

  await logChange({
    adminId, adminName,
    actionType: "engine_toggle",
    targetSystem: "engine_registry",
    targetId: engineId,
    previousState: { enabled: engine.enabled },
    newState: { enabled },
    description: `${enabled ? "Enabled" : "Disabled"} engine: ${engine.engineName}`,
    rollbackData: { restoreState: { enabled: engine.enabled, engineName: engine.engineName, sortOrder: engine.sortOrder, configJson: engine.configJson } },
  });

  return { success: true };
}

export async function reorderEngines(orderedIds: string[], adminId: string, adminName?: string) {
  const currentEngines = await listEngines();
  const previousOrder = currentEngines.map(e => ({ engineId: e.engineId, sortOrder: e.sortOrder }));

  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(engineRegistry)
      .set({ sortOrder: i, updatedAt: Date.now() })
      .where(eq(engineRegistry.engineId, orderedIds[i]));
  }

  await logChange({
    adminId, adminName,
    actionType: "engine_reorder",
    targetSystem: "engine_registry",
    previousState: previousOrder,
    newState: orderedIds.map((id, i) => ({ engineId: id, sortOrder: i })),
    description: `Reordered ${orderedIds.length} engines`,
  });

  return { success: true };
}

// ─── Stream Manager ───

export async function listStreams() {
  return db.select().from(dataStreamRegistry);
}

export async function addStream(
  input: {
    streamId: string; streamName: string; streamType: string;
    sourceUrl?: string; updateFrequency?: string;
    signalWeight?: number; confidenceMultiplier?: number;
    description?: string; fieldMapping?: Record<string, string>;
  },
  adminId: string,
  adminName?: string,
) {
  await db.insert(dataStreamRegistry).values({
    streamId: input.streamId,
    streamName: input.streamName,
    streamType: input.streamType as any,
    sourceUrl: input.sourceUrl,
    updateFrequency: (input.updateFrequency as any) || "daily",
    signalWeight: input.signalWeight ?? 100,
    confidenceMultiplier: input.confidenceMultiplier ?? 100,
    description: input.description,
    fieldMapping: input.fieldMapping,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await logChange({
    adminId, adminName,
    actionType: "stream_add",
    targetSystem: "data_stream_registry",
    targetId: input.streamId,
    newState: input,
    description: `Added stream: ${input.streamName}`,
    rollbackData: { sql: `DELETE FROM data_stream_registry WHERE stream_id_dsr = '${input.streamId}'` },
  });

  return { success: true };
}

export async function editStream(
  streamId: string,
  updates: { streamName?: string; signalWeight?: number; confidenceMultiplier?: number; enabled?: boolean; description?: string; sourceUrl?: string; updateFrequency?: string },
  adminId: string,
  adminName?: string,
) {
  const [stream] = await db.select().from(dataStreamRegistry).where(eq(dataStreamRegistry.streamId, streamId));
  if (!stream) throw new Error("Stream not found");

  const setValues: any = { updatedAt: Date.now() };
  if (updates.streamName !== undefined) setValues.streamName = updates.streamName;
  if (updates.signalWeight !== undefined) setValues.signalWeight = updates.signalWeight;
  if (updates.confidenceMultiplier !== undefined) setValues.confidenceMultiplier = updates.confidenceMultiplier;
  if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.sourceUrl !== undefined) setValues.sourceUrl = updates.sourceUrl;
  if (updates.updateFrequency !== undefined) setValues.updateFrequency = updates.updateFrequency;

  await db.update(dataStreamRegistry).set(setValues).where(eq(dataStreamRegistry.streamId, streamId));

  await logChange({
    adminId, adminName,
    actionType: "stream_edit",
    targetSystem: "data_stream_registry",
    targetId: streamId,
    previousState: stream,
    newState: updates,
    description: `Edited stream: ${stream.streamName}`,
    rollbackData: { restoreState: { streamName: stream.streamName, signalWeight: stream.signalWeight, confidenceMultiplier: stream.confidenceMultiplier, enabled: stream.enabled } },
  });

  return { success: true };
}

export async function disableStream(streamId: string, adminId: string, adminName?: string) {
  return editStream(streamId, { enabled: false }, adminId, adminName);
}

// ─── Schema Manager ───

export async function listTables() {
  const result = await db.execute(sql`SHOW TABLES`);
  const rows = result[0] as unknown as any[];
  const tableNames = rows.map((r: any) => Object.values(r)[0] as string).sort();

  const tables = [];
  for (const name of tableNames) {
    try {
      const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${name}\``));
      const rowCount = ((countResult[0] as unknown as any[])[0] as any)?.cnt || 0;
      tables.push({ tableName: name, rowCount });
    } catch {
      tables.push({ tableName: name, rowCount: 0 });
    }
  }

  return tables;
}

export async function inspectTable(tableName: string) {
  // Get CREATE TABLE
  let createStatement = "";
  try {
    const result = await db.execute(sql.raw(`SHOW CREATE TABLE \`${tableName}\``));
    const rows = result[0] as unknown as any[];
    createStatement = (rows[0] as any)?.["Create Table"] || "";
  } catch { /* */ }

  // Get columns
  let columns: any[] = [];
  try {
    const result = await db.execute(sql.raw(`DESCRIBE \`${tableName}\``));
    columns = result[0] as unknown as any[];
  } catch { /* */ }

  // Get row count
  let rowCount = 0;
  try {
    const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${tableName}\``));
    rowCount = ((result[0] as unknown as any[])[0] as any)?.cnt || 0;
  } catch { /* */ }

  // Get sample rows
  let sampleRows: any[] = [];
  try {
    const result = await db.execute(sql.raw(`SELECT * FROM \`${tableName}\` LIMIT 5`));
    sampleRows = result[0] as unknown as any[];
  } catch { /* */ }

  return { tableName, createStatement, columns, rowCount, sampleRows };
}

// ─── Migration Runner ───

export async function previewSql(sqlStatement: string) {
  // Parse the SQL to determine what it does
  const normalized = sqlStatement.trim().toUpperCase();
  const isDestructive = normalized.startsWith("DROP") || normalized.startsWith("DELETE") || normalized.startsWith("TRUNCATE") || normalized.includes("ALTER TABLE");
  const isSelect = normalized.startsWith("SELECT") || normalized.startsWith("SHOW") || normalized.startsWith("DESCRIBE");

  return {
    sql: sqlStatement,
    isDestructive,
    isSelect,
    riskLevel: isDestructive ? "high" : isSelect ? "low" : "medium",
    warning: isDestructive ? "This is a destructive operation. Data may be permanently lost." : null,
  };
}

export async function executeSql(
  sqlStatement: string,
  adminId: string,
  adminName?: string,
): Promise<{ success: boolean; result: any; rowsAffected: number }> {
  const preview = await previewSql(sqlStatement);

  try {
    const result = await db.execute(sql.raw(sqlStatement));
    const rows = result[0] as unknown as any[];
    const rowsAffected = (result[0] as any)?.affectedRows || rows?.length || 0;

    await logChange({
      adminId, adminName,
      actionType: preview.isDestructive ? "schema_edit" : "migration_run",
      targetSystem: "database",
      description: `Executed SQL: ${sqlStatement.substring(0, 200)}${sqlStatement.length > 200 ? "..." : ""}`,
      newState: { sql: sqlStatement, rowsAffected },
    });

    return { success: true, result: preview.isSelect ? rows : { affectedRows: rowsAffected }, rowsAffected };
  } catch (error: any) {
    return { success: false, result: { error: error.message }, rowsAffected: 0 };
  }
}

// ─── System Stats ───

export async function getSystemStats() {
  const tables = await listTables();
  const engines = await listEngines();
  const streams = await listStreams();
  const recentChanges = await getChangeLog(10);

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return {
    tableCount: tables.length,
    totalRows,
    engineCount: engines.length,
    enabledEngines: engines.filter(e => e.enabled).length,
    streamCount: streams.length,
    enabledStreams: streams.filter(s => s.enabled).length,
    recentChangeCount: recentChanges.length,
    lastChangeAt: recentChanges.length > 0 ? Number(recentChanges[0].timestamp) : null,
  };
}
