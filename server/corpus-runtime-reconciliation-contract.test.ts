import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const configRaw = read("../config/corpus-runtime-reconciliation-v1.json");
const config = JSON.parse(configRaw) as {
  schema_version: string;
  report_id: string;
  slices: Array<{
    slice_id: string;
    family_key: string;
    queue_rows: Array<{ queue_id: number; source_role: string }>;
  }>;
};
const script = read("../scripts/audit-corpus-runtime-reconciliation.mjs");

describe("corpus-to-runtime reconciliation contract", () => {
  it("locks the Minnesota lineage and Utah parser-loss slices", () => {
    expect(config.schema_version).toBe("1.0.0");
    expect(config.report_id).toBe("corpus_runtime_reconciliation_v1");

    const minnesota = config.slices.find(
      (slice) => slice.slice_id === "minnesota_lineage",
    );
    const utah = config.slices.find(
      (slice) => slice.slice_id === "utah_parser_loss",
    );

    expect(minnesota?.family_key).toBe("general_state_registry");
    expect(minnesota?.queue_rows).toEqual([
      expect.objectContaining({ queue_id: 205, source_role: "baseline" }),
      expect.objectContaining({ queue_id: 27, source_role: "enriched" }),
    ]);
    expect(utah?.queue_rows).toEqual([
      expect.objectContaining({
        queue_id: 215,
        source_role: "parser_loss_specimen",
      }),
    ]);
  });

  it("uses a repeatable read-only database snapshot", () => {
    expect(script).toContain(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(script).toContain("writes_performed: false");
    expect(script).not.toMatch(
      /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s+table|alter\s+table|drop\s+table|create\s+table)\b/i,
    );
  });

  it("traces the existing family, precedence, candidate, accounting, and runtime contracts", () => {
    for (const tableName of [
      "corpus_import_queue",
      "registry_entity_extraction_v4",
      "luminari_document_family_contracts",
      "luminari_source_precedence_rules",
      "luminari_table_classification",
      "conveyor_promotion_accounting",
    ]) {
      expect(script).toContain(tableName);
    }

    expect(script).toContain("candidate_fingerprint_sha256");
    expect(script).toContain("source_text_sha256");
    expect(script).toContain("field_binding_loss_count");
    expect(script).toContain("source_line_start");
    expect(script).toContain("source_line_end");
    expect(script).toContain("field_metadata");
    expect(script).toContain('"candidate_extraction"');
    expect(script).toContain("blocked_pending_reconciliation");
  });

  it("never authorizes promotion or Docket changes", () => {
    expect(configRaw).toContain("no_production_promotion_during_audit");
    expect(script).not.toContain("promote_registry_entity_candidates_apply");
    expect(script).not.toContain("docket_bill_state_cache");
    expect(script.toLowerCase()).not.toContain("https://api.legiscan.com");
    expect(script).not.toContain("get_bill(");
  });
});
