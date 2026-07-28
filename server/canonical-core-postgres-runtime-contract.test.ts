import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const source = read("./services/canonical-core.ts");

describe("canonical core PostgreSQL runtime contract", () => {
  it("uses canonical snake_case identifiers for current runtime reads", () => {
    for (const identifier of [
      "event_type",
      "pipeline_type",
      "state_code",
      "created_at",
      "engine_id",
      "engine_run_status",
      "completed_at",
      "dataset_id_run",
      "ingest_status",
      "records_inserted",
      "records_processed",
    ]) {
      expect(source).toContain(identifier);
    }

    expect(source).not.toContain("SELECT id, eventType");
    expect(source).not.toContain("SELECT engine_id as engine_name,\n             COUNT(*) as total_runs,\n             MAX(completedAt)");
    expect(source).not.toContain("SELECT ingestStatus FROM ingest_runs");
  });

  it("consumes node-postgres query results through rows", () => {
    expect(source).toContain("eventResult.rows.map");
    expect(source).toContain("engineResult.rows.map");
    expect(source).toContain("ingestResult.rows.map");
    expect(source).not.toContain("const [eventRows] = await pool.query");
    expect(source).not.toContain("const [engineRows] = await pool.query");
    expect(source).not.toContain("const [ingestRows] = await pool.query");
  });

  it("derives the latest status deterministically from the latest runtime row", () => {
    expect(source).toContain("ARRAY_AGG(");
    expect(source).toContain("ORDER BY COALESCE(completed_at, started_at, created_at) DESC, id DESC");
    expect(source).toContain("ORDER BY COALESCE(end_time, completed_at, started_at, created_at) DESC, id DESC");
  });
});
