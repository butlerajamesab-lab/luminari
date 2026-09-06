import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sovereign Control system API panel", () => {
  const panel = readFileSync(
    "client/src/components/sovereign/SystemApiPanel.tsx",
    "utf8",
  );
  const sovereignControl = readFileSync(
    "client/src/pages/SovereignControl.tsx",
    "utf8",
  );

  it("places health and route visibility in Admin Control", () => {
    expect(sovereignControl).toContain(
      'import SystemApiPanel from "@/components/sovereign/SystemApiPanel"',
    );
    expect(sovereignControl).toContain(
      '{ id: "system-api", label: "System API", icon: Server }',
    );
    expect(sovereignControl).toContain('activeSection === "system-api"');
  });

  it("reads only the two bounded system diagnostics", () => {
    expect(panel).toContain(
      'fetchDiagnostic<SystemHealth>("/api/system/health")',
    );
    expect(panel).toContain(
      'fetchDiagnostic<SystemRoutes>("/api/system/routes")',
    );
    expect(panel).not.toMatch(
      /LIGHTHOUSE_SYSTEM_READ_TOKEN|x-lighthouse-system-read-token/,
    );
    expect(panel).not.toMatch(/method:\s*["']POST["']/);
  });

  it("makes route inventory searchable without exposing record data", () => {
    expect(panel).toContain('aria-label="Search system routes"');
    expect(panel).toMatch(
      /Structural metadata only; no\s+records or secrets\./,
    );
  });
});
