import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_ROUTE_INVENTORY_SHA256,
  PLATFORM_ROUTE_PATHS,
} from "../shared/platform-route-manifest";

const app = readFileSync("client/src/App.tsx", "utf8");

function registeredPaths(): string[] {
  return Array.from(
    app.matchAll(/<Route\s+path="([^"]+)"/g),
    (match) => match[1],
  );
}

describe("Luminari platform route surface", () => {
  it("preserves the complete current route inventory", () => {
    const declarations = registeredPaths();
    const unique = Array.from(new Set(declarations)).sort();
    const inventoryHash = createHash("sha256")
      .update(unique.join("\n"))
      .digest("hex");

    expect(declarations).toHaveLength(107);
    expect(unique).toHaveLength(106);
    expect(declarations.filter((path) => path === "/")).toHaveLength(2);
    expect(inventoryHash).toBe(PLATFORM_ROUTE_INVENTORY_SHA256);
    expect(unique).toEqual([...PLATFORM_ROUTE_PATHS]);
  });

  it("retains every platform world while the intake adapter changes underneath it", () => {
    const paths = new Set(registeredPaths());
    const representativePaths = [
      // Case and evidence
      "/cases",
      "/upload",
      "/documents/:id",
      "/spine/:caseId/:snapshotId",
      // Intake and guided flow
      "/welcome",
      "/intake",
      "/guided-intake",
      "/guide/:caseId",
      // Resources and civic intelligence
      "/benefits",
      "/resources",
      "/civic-map",
      "/lighthouse",
      "/docket/:slug",
      // Legal, signal, and strategy
      "/legal-library",
      "/doctrine-graph",
      "/signal-registry",
      "/enforcement-pathway",
      // Recognition and Native Nations
      "/native-nations",
      "/recognition-gideon",
      "/recognition-atlas/:tribe_id/:layer_slug",
      // Control and governance
      "/mission-control",
      "/sovereign-control",
      "/ingestion-control",
      "/verify",
      // Workshop and action
      "/workshop",
      "/workbench/:caseId",
      "/evidence-lab",
      "/filing-generator",
    ];

    for (const path of representativePaths)
      expect(paths.has(path), path).toBe(true);
  });

  it("keeps repaired navigation targets on registered paths", () => {
    const controlRoom = readFileSync(
      "client/src/pages/ControlRoom.tsx",
      "utf8",
    );
    const scenarios = readFileSync(
      "client/src/pages/AdminTestScenarios.tsx",
      "utf8",
    );
    const benefits = readFileSync(
      "client/src/pages/BenefitsNavigator.tsx",
      "utf8",
    );

    expect(controlRoom).toContain("navigate('/benefits')");
    expect(controlRoom).not.toContain("/benefits-navigator");
    expect(scenarios).toContain("navigate(`/guide/${data.caseId}`)");
    expect(scenarios).not.toContain("navigate(`/cases/${data.caseId}`)");
    expect(benefits).toContain('href: "/foia"');
    expect(benefits).not.toContain("/foia-tracking");
  });
});
