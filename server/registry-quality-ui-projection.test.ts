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
const followup = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260822000101_add_identity_unresolved_registry_quality_bucket_v1.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("registry quality UI projection", () => {
  it("aggregates the canonical current civic-object substrate", () => {
    for (const source of [migration, followup]) {
      expect(source).toContain("public.v_lighthouse_civic_object_current_v1");
      expect(source).toContain("public.v_ui_registry_quality_v1");
    }
  });

  it("reports stored readiness and all defined unresolved states without scoring", () => {
    for (const source of [migration, followup]) {
      expect(source).toContain("typed_ready_objects");
      expect(source).toContain("jurisdiction_ready_objects");
      expect(source).toContain("direct_access_ready_objects");
      expect(source).toContain("unresolved_or_held_objects");
      expect(source).toContain("jurisdiction_conflict_objects");
      expect(source).toContain("identity_conflict_objects");
      expect(source).toContain("identity_unresolved_objects");
      expect(source).toContain("resource_identity_unresolved_objects");
      expect(source).toContain("resource_access_unresolved_objects");
      expect(source).not.toMatch(/score|rank|confidence/i);
    }
  });

  it("is read-only projection logic", () => {
    for (const source of [migration, followup]) {
      expect(source).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    }
  });
});
