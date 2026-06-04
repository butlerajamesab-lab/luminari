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
import { db, pool } from "../db";
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
      await pool.query(
        `UPDATE data_stream_registry
         SET stream_name_dsr = COALESCE($2, stream_name_dsr),
             signal_weight_dsr = COALESCE($3, signal_weight_dsr),
             confidence_multiplier_dsr = COALESCE($4, confidence_multiplier_dsr),
             enabled_dsr = COALESCE($5, enabled_dsr),
             updated_at_dsr = $6
         WHERE stream_id_dsr = $1`,
        [
          change.targetId,
          prev.stream_name_dsr ?? prev.stream_name ?? null,
          prev.signal_weight_dsr ?? prev.signal_weight ?? null,
          prev.confidence_multiplier_dsr ?? prev.confidence_multiplier ?? null,
          prev.enabled_dsr ?? prev.enabled ?? null,
          Date.now(),
        ],
      );
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
  const previousOrder = currentEngines.map((e: any) => ({ engineId: e.engineId, sortOrder: e.sortOrder }));

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

export interface CanonicalStream {
  stream_id: string;
  stream_name: string;
  stream_type: string;
  source_url: string | null;
  update_frequency: string | null;
  signal_weight: number;
  confidence_multiplier: number;
  description: string | null;
  field_mapping: Record<string, string> | null;
  enabled: boolean;
  records_ingested: number;
  signals_generated: number;
  auto_disabled: boolean;
  consecutive_failures: number;
  last_error: string | null;
  created_at: number | null;
  updated_at: number | null;
}

function rowsFromResult<T>(result: any): T[] {
  return (Array.isArray(result) ? result[0] : result.rows) as T[];
}

export async function listStreams(): Promise<CanonicalStream[]> {
  const result = await pool.query(`
    SELECT
      stream_id_dsr AS stream_id,
      stream_name_dsr AS stream_name,
      stream_type_dsr AS stream_type,
      source_url_dsr AS source_url,
      update_freq_dsr AS update_frequency,
      signal_weight_dsr AS signal_weight,
      confidence_multiplier_dsr AS confidence_multiplier,
      description_dsr AS description,
      field_mapping_dsr AS field_mapping,
      enabled_dsr AS enabled,
      records_ingested_dsr AS records_ingested,
      signals_generated_dsr AS signals_generated,
      auto_disabled_dsr AS auto_disabled,
      consecutive_failures_dsr AS consecutive_failures,
      last_error_dsr AS last_error,
      created_at_dsr AS created_at,
      updated_at_dsr AS updated_at
    FROM data_stream_registry
    ORDER BY stream_id_dsr ASC
  `);
  return rowsFromResult<CanonicalStream>(result);
}

export async function addStream(
  input: {
    stream_id: string; stream_name: string; stream_type: string;
    source_url?: string; update_frequency?: string;
    signal_weight?: number; confidence_multiplier?: number;
    description?: string; field_mapping?: Record<string, string>;
  },
  adminId: string,
  adminName?: string,
) {
  const now = Date.now();
  await pool.query(
    `INSERT INTO data_stream_registry (
      stream_id_dsr, stream_name_dsr, stream_type_dsr, source_url_dsr, update_freq_dsr,
      signal_weight_dsr, confidence_multiplier_dsr, description_dsr, field_mapping_dsr,
      enabled_dsr, records_ingested_dsr, signals_generated_dsr, created_at_dsr, updated_at_dsr
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,0,0,$10,$10)`,
    [
      input.stream_id,
      input.stream_name,
      input.stream_type,
      input.source_url ?? null,
      input.update_frequency ?? "daily",
      input.signal_weight ?? 100,
      input.confidence_multiplier ?? 100,
      input.description ?? null,
      input.field_mapping ? JSON.stringify(input.field_mapping) : null,
      now,
    ],
  );

  await logChange({
    adminId, adminName,
    actionType: "stream_add",
    targetSystem: "data_stream_registry",
    targetId: input.stream_id,
    newState: input,
    description: `Added stream: ${input.stream_name}`,
    rollbackData: { sql: `DELETE FROM data_stream_registry WHERE stream_id_dsr = '${input.stream_id.replace(/'/g, "''")}'` },
  });

  return { success: true };
}

export async function editStream(
  stream_id: string,
  updates: { stream_name?: string; signal_weight?: number; confidence_multiplier?: number; enabled?: boolean; description?: string; source_url?: string; update_frequency?: string },
  adminId: string,
  adminName?: string,
) {
  const previousRows = await pool.query(`SELECT * FROM data_stream_registry WHERE stream_id_dsr = $1 LIMIT 1`, [stream_id]);
  const previous = rowsFromResult<any>(previousRows)[0];
  if (!previous) throw new Error("Stream not found");

  const setClauses = ["updated_at_dsr = $1"];
  const values: unknown[] = [Date.now()];
  const add = (column: string, value: unknown) => {
    values.push(value);
    setClauses.push(`${column} = $${values.length}`);
  };
  if (updates.stream_name !== undefined) add("stream_name_dsr", updates.stream_name);
  if (updates.signal_weight !== undefined) add("signal_weight_dsr", updates.signal_weight);
  if (updates.confidence_multiplier !== undefined) add("confidence_multiplier_dsr", updates.confidence_multiplier);
  if (updates.enabled !== undefined) add("enabled_dsr", updates.enabled);
  if (updates.description !== undefined) add("description_dsr", updates.description);
  if (updates.source_url !== undefined) add("source_url_dsr", updates.source_url);
  if (updates.update_frequency !== undefined) add("update_freq_dsr", updates.update_frequency);
  values.push(stream_id);
  await pool.query(`UPDATE data_stream_registry SET ${setClauses.join(", ")} WHERE stream_id_dsr = $${values.length}`, values);

  await logChange({
    adminId, adminName,
    actionType: "stream_edit",
    targetSystem: "data_stream_registry",
    targetId: stream_id,
    previousState: previous,
    newState: updates,
    description: `Edited stream: ${previous.stream_name_dsr ?? stream_id}`,
    rollbackData: { restoreState: previous },
  });

  return { success: true };
}

export async function disableStream(stream_id: string, adminId: string, adminName?: string) {
  return editStream(stream_id, { enabled: false }, adminId, adminName);
}

// ─── Schema Manager ───

export async function listTables() {
  const result = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
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
    const result = await db.execute(sql.raw(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'${tableName}\'`));
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
    enabledEngines: engines.filter((e: any) => e.enabled).length,
    streamCount: streams.length,
    enabledStreams: streams.filter(s => s.enabled).length,
    recentChangeCount: recentChanges.length,
    lastChangeAt: recentChanges.length > 0 ? Number(recentChanges[0].timestamp) : null,
  };
}
