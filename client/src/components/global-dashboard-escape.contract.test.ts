import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("global dashboard escape", () => {
  it("keeps Dashboard reachable from shared layer headers", () => {
    const source = readFileSync("client/src/components/LayerNavBar.tsx", "utf8");
    expect(source).toContain('navigate("/mission-control")');
    expect(source).toContain("Dashboard");
    expect(source).toContain('navigate("/architecture")');
  });

  it("keeps Dashboard reachable beside the globally mounted helper", () => {
    const source = readFileSync("client/src/components/LuminariHelper.tsx", "utf8");
    expect(source).toContain('navigate("/mission-control")');
    expect(source).toContain("Global control escape");
  });

  it("keeps Dashboard reachable even when the page tree crashes", () => {
    const source = readFileSync("client/src/components/ErrorBoundary.tsx", "utf8");
    expect(source).toContain('window.location.href = "/mission-control"');
    expect(source).toContain("Dashboard");
  });
});
