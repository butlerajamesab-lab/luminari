import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

describe("exact-live registry and architecture router contracts", () => {
  it("routes active registry reads through the physical-schema adapter", () => {
    const registry = source("./routers/registry.ts");

    expect(registry).toContain("list_live_registry_forms");
    expect(registry).toContain("list_live_registry_agencies");
    expect(registry).toContain("list_live_escalation_paths");
    expect(registry).toContain("mental_health_resources_unavailable");
    expect(registry).not.toContain("formsRegistry");
    expect(registry).not.toContain("agenciesRegistry");
    expect(registry).not.toContain("escalationRegistry");
    expect(registry).not.toContain("mentalHealthResources");
  });

  it("keeps filtered escalation paths explicit when identity is unavailable", () => {
    const client = source("../client/src/components/EscalationPath.tsx");

    expect(client).toContain("!escalationResult.available");
    expect(client).toContain("escalationResult.message");
    expect(client).toContain("profile.availability.escalations.message");
    expect(client).not.toContain("escalations.length === 0");
  });

  it("routes investigation and filing list/get/readiness through exact SQL DTOs", () => {
    const architecture = source("./routers/architecture-map.ts");
    const focused = architecture.slice(
      architecture.indexOf("// INVESTIGATION GUIDANCE"),
      architecture.indexOf("// ARCHITECTURE MAP — SYSTEM OVERVIEW"),
    );

    expect(focused).toContain("list_live_investigation_guidance");
    expect(focused).toContain("get_live_investigation_guidance");
    expect(focused).toContain("list_live_filing_templates");
    expect(focused).toContain("get_live_filing_template");
    expect(focused).toContain("find_live_filing_template");
    expect(focused).not.toContain("db.select()");
  });
});
