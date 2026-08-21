import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260821235329_add_registry_quality_ui_projection_v1.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("registry quality UI projection", () => {
  it("aggregates the canonical current civic-object substrate", () => {
    expect(migration).toContain("public.v_lighthouse_civic_object_current_v1");
    expect(migration).toContain("public.v_ui_registry_quality_v1");
  });

  it("reports stored readiness and unresolved states without scoring", () => {
    expect(migration).toContain("typed_ready_objects");
    expect(migration).toContain("jurisdiction_ready_objects");
    expect(migration).toContain("direct_access_ready_objects");
    expect(migration).toContain("unresolved_or_held_objects");
    expect(migration).toContain("jurisdiction_conflict_objects");
    expect(migration).toContain("identity_conflict_objects");
    expect(migration).not.toMatch(/score|rank|confidence/i);
  });

  it("is read-only projection logic", () => {
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
  });
});
