import { customType, integer, pgTable, serial, text, bigint } from "drizzle-orm/pg-core";

/**
 * Canonical adapter for public.engine_runs.
 *
 * This table predates the repository-wide snake_case ownership doctrine and the
 * generated legacy schema still contains a mixture of camelCase and snake_case
 * physical column names. Production is authoritative: every physical column in
 * this adapter matches information_schema exactly.
 *
 * Do not add compatibility camelCase columns to Postgres. Callers keep normal
 * TypeScript property names while Drizzle maps them to the canonical DB names.
 */

const jsonText = customType<{ data: unknown; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    if (value == null || value === "") return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
});

const stringOrNumberText = customType<{ data: string | number; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return String(value);
  },
  fromDriver(value) {
    return value;
  },
});

export const engineRunsCanonical = pgTable("engine_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id"),
  caseId: integer("case_id"),
  engineId: text("engine_id"),
  userId: stringOrNumberText("user_id"),
  runType: text("engine_run_type"),
  runStatus: text("engine_run_status"),
  status: text("status"),
  currentStage: text("current_stage"),
  stageResults: jsonText("stage_results"),
  outputRefs: jsonText("output_refs"),
  snapshotId: integer("snapshot_id"),
  viabilityRunId: stringOrNumberText("viability_run_id"),
  strategyMatterProfileId: stringOrNumberText("strategy_matter_profile_id"),
  assemblyPacketId: stringOrNumberText("assembly_packet_id"),
  patternAggregationRunId: stringOrNumberText("pattern_aggregation_run_id"),
  errorMessage: text("error_message"),
  startedAt: bigint("started_at", { mode: "number" }),
  completedAt: bigint("completed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }),
});

export type CanonicalEngineRun = typeof engineRunsCanonical.$inferSelect;
export type InsertCanonicalEngineRun = typeof engineRunsCanonical.$inferInsert;
