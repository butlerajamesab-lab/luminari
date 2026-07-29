import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("data-stream control PostgreSQL boundary", () => {
  const schema = read("../../../drizzle/schema.ts");
  const executor = read("../../executor-routes.ts");
  const scheduler = read("../scheduler.ts");

  it("maps ingest_runs through the canonical snake_case columns", () => {
    const start = schema.indexOf('export const ingestRuns = pgTable("ingest_runs"');
    const end = schema.indexOf("export type IngestRun", start);
    const definition = schema.slice(start, end);

    for (const column of [
      'datasetId: varchar("dataset_id_run"',
      'startTime: bigint("start_time"',
      'endTime: bigint("end_time"',
      'recordsProcessed: integer("records_processed")',
      'recordsInserted: integer("records_inserted")',
      'recordsUpdated: integer("records_updated")',
      'signalsGenerated: integer("signals_generated")',
      ')("ingest_status")',
    ]) {
      expect(definition).toContain(column);
    }

    expect(definition).not.toContain('"ingestStatus"');
    expect(definition).not.toContain('"datasetId_run"');
    expect(definition).not.toContain('"startTime"');
    expect(definition).not.toContain('"endTime"');
  });

  it("selects enabled streams with PostgreSQL boolean predicates", () => {
    expect(executor).toContain("enabled_dsr IS TRUE");
    expect(executor).toContain("COALESCE(auto_disabled_dsr, FALSE) IS FALSE");
    expect(executor).toContain("retired_superseded_by_atlas");
    expect(executor).not.toContain("enabled_dsr = 1");
    expect(executor).not.toContain("auto_disabled_dsr = 0");
  });

  it("preserves unsuccessful stream results instead of overwriting them", () => {
    expect(executor).toContain("const stream_succeeded = result.success === true");
    expect(executor).toContain("if (stream_succeeded) succeeded++");
    expect(executor).toContain("else failed++");
    expect(executor).toContain("const success = normalized.success !== false");
  });

  it("keeps scheduler orphan recovery on the corrected ingestRuns mapping", () => {
    expect(scheduler).toContain('.where(eq(ingestRuns.status, "running"))');
    expect(scheduler).toContain('status: "failed"');
    expect(scheduler).toContain('outcomeClassification: "orphan_recovery"');
  });
});
