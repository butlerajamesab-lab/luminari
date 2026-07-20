import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../scripts/audit-ui-substrate-wiring.mjs", import.meta.url), "utf8");

describe("UI-to-substrate wiring audit", () => {
  it("is read-only", () => {
    expect(source).not.toMatch(/pool\.query|createClient|insert\s+into|update\s+public\.|delete\s+from/i);
    expect(source).toContain('mode: "read_only_static_audit"');
  });

  it("tracks direct API, tRPC, iframe, and SQL relation dependencies", () => {
    expect(source).toContain("extractClientDependencies");
    expect(source).toContain("extractServerRelations");
    expect(source).toContain("trpc");
    expect(source).toContain("iframe");
  });

  it("marks CivicMap as a known exception rather than a new failure", () => {
    expect(source).toContain('"client/src/pages/CivicMap.tsx"');
    expect(source).toContain('"client/public/civicmap.html"');
    expect(source).toContain("known_exception");
  });

  it("classifies known legacy and canonical backbone relations", () => {
    expect(source).toContain('"normalized_civic_resource"');
    expect(source).toContain('"luminari_resource_entities"');
    expect(source).toContain('"registry_programs"');
    expect(source).toContain('"legal_statutes"');
    expect(source).toContain('"civic_genome_bill"');
  });
});
