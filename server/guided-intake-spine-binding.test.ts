import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routedSurface = readFileSync(new URL("../client/src/pages/GuidedIntakeNew.tsx", import.meta.url), "utf8");
const guidedIntake = readFileSync(new URL("../client/src/pages/GuidedIntake.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260807055726_bind_cases_to_universal_intake_spine.sql", import.meta.url),
  "utf8",
);

describe("Guided Intake / Universal Intake Spine binding", () => {
  it("retires the category-jurisdiction prototype from production routes", () => {
    expect(routedSurface).toContain('export { default } from "./GuidedIntake"');
    expect(routedSurface).not.toContain("CATEGORIES");
    expect(routedSurface).not.toContain("Show Me My Path");
  });

  it("keeps the Guided Intake matcher deterministic and completes map intake explicitly", () => {
    expect(guidedIntake).toContain("expanded deterministic rule pass");
    expect(guidedIntake).toContain("Matching rules...");
    expect(guidedIntake).toContain("completeMapSession");
    expect(guidedIntake).not.toContain("Use AI for deeper analysis");
    expect(guidedIntake).not.toContain("Deep analyzing...");
  });

  it("binds every case to one primary Universal Intake Spine session", () => {
    expect(migration).toContain("public.intake_sessions");
    expect(migration).toContain("public.case_intake_links");
    expect(migration).toContain("link.is_primary = true");
    expect(migration).toContain("'restricted'");
    expect(migration).toContain("'case_create'");
    expect(migration).toContain("luminari_ensure_case_identity_bridge_v1");
  });
});
