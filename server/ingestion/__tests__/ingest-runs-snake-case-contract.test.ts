import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("ingest_runs PostgreSQL mapping", () => {
  const schema = read("../../../drizzle/schema.ts");
  const scheduler = read("../scheduler.ts");
  const ingestion_router = read("../../routers/ingestion.ts");

  const start = schema.indexOf('export const ingestRuns = pgTable("ingest_runs"');
  const end = schema.indexOf("export type IngestRun", start);
  const definition = schema.slice(start, end);

  it("maps every active run field to the live snake_case columns", () => {
    for (const column of [
      'datasetId: varchar("dataset_id_run"',
      'startTime: bigint("start_time"',
      'endTime: bigint("end_time"',
      'recordsProcessed: integer("records_processed")',
      'recordsInserted: integer("records_inserted")',
      'recordsUpdated: integer("records_updated")',
      'signalsGenerated: integer("signals_generated")',
      ')("ingest_status")',
      'jsonb("errors_run")',
      'text("summary_run")',
      'varchar("outcome_classification_run"',
    ]) {
      expect(definition).toContain(column);
    }
  });

  it("contains none of the removed camelCase physical column names", () => {
    for (const legacy of [
      '"datasetId_run"',
      '"startTime"',
      '"endTime"',
      '"recordsProcessed"',
      '"recordsInserted"',
      '"recordsUpdated"',
      '"signalsGenerated"',
      '"ingestStatus"',
    ]) {
      expect(definition).not.toContain(legacy);
    }
  });

  it("covers the scheduler orphan scan and run-history reader that use this mapping", () => {
    expect(scheduler).toContain('.where(eq(ingestRuns.status, "running"))');
    expect(scheduler).toContain('status: "failed"');
    expect(ingestion_router).toContain('.from(ingestRuns)');
  });
});
