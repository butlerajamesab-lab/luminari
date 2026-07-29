import fs from "node:fs";

function replace_once(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch marker: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const executor_path = "server/executor-routes.ts";
let executor = fs.readFileSync(executor_path, "utf8");

executor = replace_once(
  executor,
  `  const normalized = normalizeExecutorResult(result);\n  res.json({\n    ...normalized,\n    success: true,\n    stream_id,\n    message,\n  });`,
  `  const normalized = normalizeExecutorResult(result);\n  const success = normalized.success !== false;\n  const errors = Array.isArray(normalized.errors)\n    ? normalized.errors.map(String)\n    : [];\n  const result_message = success\n    ? message\n    : errors.join(", ") ||\n      (typeof normalized.error === "string" ? normalized.error : message);\n\n  res.json({\n    ...normalized,\n    success,\n    stream_id,\n    message: result_message,\n  });`,
  "truthful executor result",
);

executor = replace_once(
  executor,
  `        WHERE enabled_dsr = 1 AND (auto_disabled_dsr = 0 OR auto_disabled_dsr IS NULL)\n        ORDER BY signal_weight_dsr DESC`,
  `        WHERE enabled_dsr IS TRUE\n          AND COALESCE(auto_disabled_dsr, FALSE) IS FALSE\n          AND COALESCE(last_run_status_dsr, '') <> 'retired_superseded_by_atlas'\n        ORDER BY signal_weight_dsr DESC`,
  "PostgreSQL boolean stream selection",
);

executor = replace_once(
  executor,
  `          const result = normalizeExecutorResult(await triggerManualIngestion(stream_id)) as ExecutorResult;\n          results.push({\n            ...result,\n            stream_id,\n            success: true,\n            message: "OK",\n          });\n          succeeded++;`,
  `          const result = normalizeExecutorResult(await triggerManualIngestion(stream_id)) as ExecutorResult;\n          const stream_succeeded = result.success === true;\n          const errors = Array.isArray(result.errors)\n            ? result.errors.map(String)\n            : [];\n          results.push({\n            ...result,\n            stream_id,\n            success: stream_succeeded,\n            message: stream_succeeded\n              ? "OK"\n              : errors.join(", ") || "Stream run returned unsuccessful",\n          });\n          if (stream_succeeded) succeeded++;\n          else failed++;`,
  "truthful run-all accounting",
);

fs.writeFileSync(executor_path, executor);

const schema_path = "drizzle/schema.ts";
let schema = fs.readFileSync(schema_path, "utf8");
const ingest_runs_before = `export const ingestRuns = pgTable("ingest_runs", {\n  id: serial("id").primaryKey(),\n  datasetId: varchar("datasetId_run", { length: 64 }).notNull(),\n  startTime: bigint("startTime", { mode: "number" }).notNull(),\n  endTime: bigint("endTime", { mode: "number" }),\n  recordsProcessed: integer("recordsProcessed").default(0).notNull(),\n  recordsInserted: integer("recordsInserted").default(0).notNull(),\n  recordsUpdated: integer("recordsUpdated").default(0).notNull(),\n  signalsGenerated: integer("signalsGenerated").default(0).notNull(),\n  status: pgEnum("ingest_runs_ingest_status_enum", ["running", "completed", "failed", "cancelled", "api_unavailable", "partial"])("ingestStatus").default("running").notNull(),\n  errors: jsonb("errors_run").$type<string[]>(),\n  summary: text("summary_run"),`;
const ingest_runs_after = `export const ingestRuns = pgTable("ingest_runs", {\n  id: serial("id").primaryKey(),\n  datasetId: varchar("dataset_id_run", { length: 64 }).notNull(),\n  startTime: bigint("start_time", { mode: "number" }).notNull(),\n  endTime: bigint("end_time", { mode: "number" }),\n  recordsProcessed: integer("records_processed").default(0).notNull(),\n  recordsInserted: integer("records_inserted").default(0).notNull(),\n  recordsUpdated: integer("records_updated").default(0).notNull(),\n  signalsGenerated: integer("signals_generated").default(0).notNull(),\n  status: pgEnum("ingest_runs_ingest_status_enum", ["running", "completed", "failed", "cancelled", "api_unavailable", "partial"])("ingest_status").default("running").notNull(),\n  errors: jsonb("errors_run").$type<string[]>(),\n  summary: text("summary_run"),`;

schema = replace_once(
  schema,
  ingest_runs_before,
  ingest_runs_after,
  "ingest_runs canonical snake_case mapping",
);
fs.writeFileSync(schema_path, schema);

const test_path = "server/ingestion/__tests__/data-stream-control-postgres-contract.test.ts";
fs.writeFileSync(
  test_path,
  `import { readFileSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\nimport { describe, expect, it } from "vitest";\n\nfunction read(relative_path: string): string {\n  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");\n}\n\ndescribe("data-stream control PostgreSQL boundary", () => {\n  const schema = read("../../../drizzle/schema.ts");\n  const executor = read("../../executor-routes.ts");\n  const scheduler = read("../scheduler.ts");\n\n  it("maps ingest_runs through the canonical snake_case columns", () => {\n    const start = schema.indexOf('export const ingestRuns = pgTable("ingest_runs"');\n    const end = schema.indexOf("export type IngestRun", start);\n    const definition = schema.slice(start, end);\n\n    for (const column of [\n      'datasetId: varchar("dataset_id_run"',\n      'startTime: bigint("start_time"',\n      'endTime: bigint("end_time"',\n      'recordsProcessed: integer("records_processed")',\n      'recordsInserted: integer("records_inserted")',\n      'recordsUpdated: integer("records_updated")',\n      'signalsGenerated: integer("signals_generated")',\n      ')("ingest_status")',\n    ]) {\n      expect(definition).toContain(column);\n    }\n\n    expect(definition).not.toContain('"ingestStatus"');\n    expect(definition).not.toContain('"datasetId_run"');\n    expect(definition).not.toContain('"startTime"');\n    expect(definition).not.toContain('"endTime"');\n  });\n\n  it("selects enabled streams with PostgreSQL boolean predicates", () => {\n    expect(executor).toContain("enabled_dsr IS TRUE");\n    expect(executor).toContain("COALESCE(auto_disabled_dsr, FALSE) IS FALSE");\n    expect(executor).toContain("retired_superseded_by_atlas");\n    expect(executor).not.toContain("enabled_dsr = 1");\n    expect(executor).not.toContain("auto_disabled_dsr = 0");\n  });\n\n  it("preserves unsuccessful stream results instead of overwriting them", () => {\n    expect(executor).toContain("const stream_succeeded = result.success === true");\n    expect(executor).toContain("if (stream_succeeded) succeeded++");\n    expect(executor).toContain("else failed++");\n    expect(executor).toContain("const success = normalized.success !== false");\n  });\n\n  it("keeps scheduler orphan recovery on the corrected ingestRuns mapping", () => {\n    expect(scheduler).toContain('.where(eq(ingestRuns.status, "running"))');\n    expect(scheduler).toContain('status: "failed"');\n    expect(scheduler).toContain('outcomeClassification: "orphan_recovery"');\n  });\n});\n`,
);

for (const temporary of [
  "scripts/fix-data-stream-control-postgres-boundaries.mjs",
  ".github/workflows/fix-data-stream-control-postgres-boundaries.yml",
]) {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}
