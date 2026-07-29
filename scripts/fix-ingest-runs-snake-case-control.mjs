import fs from "node:fs";

function replace_once(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch marker: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const schema_path = "drizzle/schema.ts";
let schema = fs.readFileSync(schema_path, "utf8");
const before = `export const ingestRuns = pgTable("ingest_runs", {\n  id: serial("id").primaryKey(),\n  datasetId: varchar("datasetId_run", { length: 64 }).notNull(),\n  startTime: bigint("startTime", { mode: "number" }).notNull(),\n  endTime: bigint("endTime", { mode: "number" }),\n  recordsProcessed: integer("recordsProcessed").default(0).notNull(),\n  recordsInserted: integer("recordsInserted").default(0).notNull(),\n  recordsUpdated: integer("recordsUpdated").default(0).notNull(),\n  signalsGenerated: integer("signalsGenerated").default(0).notNull(),\n  status: pgEnum("ingest_runs_ingest_status_enum", ["running", "completed", "failed", "cancelled", "api_unavailable", "partial"])("ingestStatus").default("running").notNull(),\n  errors: jsonb("errors_run").$type<string[]>(),\n  summary: text("summary_run"),`;
const after = `export const ingestRuns = pgTable("ingest_runs", {\n  id: serial("id").primaryKey(),\n  datasetId: varchar("dataset_id_run", { length: 64 }).notNull(),\n  startTime: bigint("start_time", { mode: "number" }).notNull(),\n  endTime: bigint("end_time", { mode: "number" }),\n  recordsProcessed: integer("records_processed").default(0).notNull(),\n  recordsInserted: integer("records_inserted").default(0).notNull(),\n  recordsUpdated: integer("records_updated").default(0).notNull(),\n  signalsGenerated: integer("signals_generated").default(0).notNull(),\n  status: pgEnum("ingest_runs_ingest_status_enum", ["running", "completed", "failed", "cancelled", "api_unavailable", "partial"])("ingest_status").default("running").notNull(),\n  errors: jsonb("errors_run").$type<string[]>(),\n  summary: text("summary_run"),`;

schema = replace_once(schema, before, after, "ingest_runs snake_case mapping");
fs.writeFileSync(schema_path, schema);

fs.writeFileSync(
  "server/ingestion/__tests__/ingest-runs-snake-case-contract.test.ts",
  `import { readFileSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\nimport { describe, expect, it } from "vitest";\n\nfunction read(relative_path: string): string {\n  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");\n}\n\ndescribe("ingest_runs PostgreSQL mapping", () => {\n  const schema = read("../../../drizzle/schema.ts");\n  const scheduler = read("../scheduler.ts");\n  const ingestion_router = read("../../routers/ingestion.ts");\n\n  const start = schema.indexOf('export const ingestRuns = pgTable("ingest_runs"');\n  const end = schema.indexOf("export type IngestRun", start);\n  const definition = schema.slice(start, end);\n\n  it("maps every active run field to the live snake_case columns", () => {\n    for (const column of [\n      'datasetId: varchar("dataset_id_run"',\n      'startTime: bigint("start_time"',\n      'endTime: bigint("end_time"',\n      'recordsProcessed: integer("records_processed")',\n      'recordsInserted: integer("records_inserted")',\n      'recordsUpdated: integer("records_updated")',\n      'signalsGenerated: integer("signals_generated")',\n      ')("ingest_status")',\n      'jsonb("errors_run")',\n      'text("summary_run")',\n      'varchar("outcome_classification_run"',\n    ]) {\n      expect(definition).toContain(column);\n    }\n  });\n\n  it("contains none of the removed camelCase physical column names", () => {\n    for (const legacy of [\n      '"datasetId_run"',\n      '"startTime"',\n      '"endTime"',\n      '"recordsProcessed"',\n      '"recordsInserted"',\n      '"recordsUpdated"',\n      '"signalsGenerated"',\n      '"ingestStatus"',\n    ]) {\n      expect(definition).not.toContain(legacy);\n    }\n  });\n\n  it("covers the scheduler orphan scan and run-history reader that use this mapping", () => {\n    expect(scheduler).toContain('.where(eq(ingestRuns.status, "running"))');\n    expect(scheduler).toContain('status: "failed"');\n    expect(ingestion_router).toContain('.from(ingestRuns)');\n  });\n});\n`,
);

for (const temporary of [
  "scripts/fix-ingest-runs-snake-case-control.mjs",
  ".github/workflows/fix-ingest-runs-snake-case-control.yml",
]) {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}
