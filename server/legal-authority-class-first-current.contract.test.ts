import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260920221500_legal_authority_class_first_current_v1.sql", import.meta.url),
  "utf8",
);
const reader = readFileSync(new URL("./services/current-legal-authority-reader.ts", import.meta.url), "utf8");

describe("legal authority class-first current projection", () => {
  it("filters legal classes before the source-candidate winner window", () => {
    const filter = migration.indexOf("where r.object_class in ('legal_authority','unresolved_legal_reference')");
    const winner = migration.indexOf("row_number() over");
    expect(filter).toBeGreaterThan(winner);
    const rankedEnd = migration.indexOf("), hydrated as");
    expect(filter).toBeLessThan(rankedEnd);
    expect(migration).not.toContain("from public.v_lighthouse_civic_object_current_v1 c");
  });

  it("keeps the public legal catalog contract and service-only boundary", () => {
    expect(migration).toContain("create or replace view public.v_lighthouse_legal_authority_catalog_v2");
    expect(migration).toContain("as legal_catalog_ready");
    expect(migration).toContain("grant select on public.v_lighthouse_legal_authority_catalog_v2 to service_role");
    expect(reader).toContain("from public.v_lighthouse_legal_authority_catalog_v2");
  });
});
