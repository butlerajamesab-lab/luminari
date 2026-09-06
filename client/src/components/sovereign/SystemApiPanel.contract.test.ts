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

  it("reads and runs only the bounded GET diagnostics", () => {
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
    expect(panel).toContain('label: "Run System Health"');
    expect(panel).toContain('label: "Run Route Inventory"');
    expect(panel).toContain('label: "Run Public Health"');
    expect(panel).toContain('path: "/api/health"');
    expect(panel).toContain('method: "GET"');
    expect(panel).toContain("RUNNABLE_DIAGNOSTIC_PATHS.has");
  });

  it("opens only concrete routes registered by the client router", () => {
    expect(panel).toContain('aria-label="Search system routes"');
    expect(panel).toContain("isOpenableFrontendRoute(route)");
    expect(panel).toContain(
      "route.registered && isConcreteFrontendRoute(route.path)",
    );
    expect(panel).toContain('target="_blank"');
    expect(panel).toContain("Needs ID");
    expect(panel).toContain("Catalog only");
    expect(panel).toMatch(
      /Structural metadata only; no\s+records or secrets\./,
    );
  });

  it("renders each live response inline with status and duration", () => {
    expect(panel).toContain("diagnosticRun.status");
    expect(panel).toContain("diagnosticRun.duration_ms");
    expect(panel).toContain("printablePayload(diagnosticRun.payload)");
    expect(panel).toContain(
      "Push a button to run a live diagnostic and inspect its response.",
    );
  });
});
