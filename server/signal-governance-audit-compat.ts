import { sql } from "drizzle-orm";

import { db } from "./db";

function rows_from_execute_result(result: unknown): any[] {
  const native_rows = (result as { rows?: unknown })?.rows;
  if (Array.isArray(native_rows)) return native_rows;
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  return [];
}

function parse_json_value(value: unknown, fallback: unknown) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parse_detected_signal(row: any) {
  return {
    signalId: row.signal_id,
    signalType: row.signal_type,
    datasetId: row.dataset_id,
    ingestRunId: null,
    title: row.signal_type,
    explanation: row.plain_language_explanation || "",
    confidenceScore: Number(row.confidence_score ?? 0),
    severityLevel: row.severity_level,
    jurisdictionScope: row.jurisdiction_scope,
    statisticalContext: null,
    sourceRecordIds: parse_json_value(row.source_record_ids, null),
    extractionTimestamp: Number(row.extraction_timestamp ?? row.detected_at ?? 0),
    escalationTier: row.escalation_status,
    templateUsed: null,
  };
}

/**
 * PostgreSQL-compatible historical signal audit reader.
 *
 * signal_generation_log is a preserved legacy evidence table. The live
 * relation is snake_case and db.execute() returns PostgreSQL QueryResult; do
 * not depend on the historical mysql2 result[0] convention or retired column
 * aliases. Canonical Atlas Domain 3 signals continue to expose their governed
 * source/rule/engine/hash fields directly on the current dashboard contract.
 */
export async function get_signal_audit_trail(signal_id: string) {
  const signal_result = await db.execute(
    sql`select * from detected_signals where signal_id = ${signal_id} limit 1`,
  );
  const signal_rows = rows_from_execute_result(signal_result);
  const signal = signal_rows.length > 0 ? parse_detected_signal(signal_rows[0]) : null;

  const log_result = await db.execute(
    sql`select signal_id, step_name, template_used, parameters, verification_result,
               factor_breakdown, created_at
        from signal_generation_log
        where signal_id = ${signal_id}
        order by created_at`,
  );
  const log_rows = rows_from_execute_result(log_result);
  const generationLog = log_rows.map((row: any) => ({
    stepName: row.step_name,
    templateUsed: row.template_used || null,
    parameters: parse_json_value(row.parameters, {}),
    verificationResult: row.verification_result || "unknown",
    factorBreakdown: parse_json_value(row.factor_breakdown, null),
    createdAt: Number(row.created_at ?? 0),
  }));

  return { signal, generationLog };
}
