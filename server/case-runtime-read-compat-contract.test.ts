import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("case runtime read compatibility boundary", () => {
  const facade = readFileSync("server/db.ts", "utf8");
  const compat = readFileSync("server/case-runtime-read-compat.ts", "utf8");

  it("routes drifted case reads through the explicit compatibility facade", () => {
    for (const helper of [
      "getSnapshot",
      "getOpenSnapshot",
      "getLatestSnapshot",
      "listEntities",
      "getQuotesForDocument",
      "getEntityRolesForDocument",
      "listCorrelations",
      "listFindingsEnriched",
      "listSignalFlags",
    ]) {
      expect(facade).toContain(helper);
    }
    expect(facade).toContain('from "./case-runtime-read-compat"');
  });

  it("reads the live snake_case Postgres contract instead of drifted Drizzle columns", () => {
    expect(compat).toContain("snapshot_status");
    expect(compat).toContain("source_document_id");
    expect(compat).toContain("target_document_id");
    expect(compat).toContain("finding_evidentiary_weight");
    expect(compat).toContain("quote_text");
    expect(compat).toContain("entity_id");
    expect(compat).not.toContain("from(entities)");
    expect(compat).not.toContain("from(documentCorrelations)");
  });

  it("does not synthesize correlation evidence that is absent from the live table", () => {
    expect(compat).toContain("sharedIdentifiers: [] as string[]");
  });
});
