import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("global dashboard escape", () => {
  it("mounts the canonical Dashboard inside the left-rail layout", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    const layout = readFileSync("client/src/components/DashboardLayout.tsx", "utf8");
    const navigation = readFileSync("client/src/components/navigation.ts", "utf8");

    expect(app).toContain('<Route path="/dashboard"><DashboardRouter /></Route>');
    expect(app).toContain('<Route path="/dashboard" component={Home} />');
    expect(layout).toContain('setLocation("/dashboard")');
    expect(navigation).toContain(
      '{ icon: LayoutDashboard, label: "Case Overview", path: "/dashboard" }',
    );
    expect(navigation).toContain(
      '{ icon: Rocket, label: "Mission Control", path: "/mission-control" }',
    );
  });

  it("keeps Dashboard reachable from shared layer headers", () => {
    const source = readFileSync("client/src/components/LayerNavBar.tsx", "utf8");
    expect(source).toContain('navigate("/dashboard")');
    expect(source).not.toContain('navigate("/mission-control")');
    expect(source).toContain("Dashboard");
    expect(source).toContain('navigate("/architecture")');
  });

  it("keeps Dashboard reachable beside the globally mounted helper", () => {
    const source = readFileSync("client/src/components/LuminariHelper.tsx", "utf8");
    expect(source).toContain('navigate("/dashboard")');
    expect(source).toContain('const onDashboard = location === "/dashboard"');
    expect(source).not.toContain('navigate("/mission-control")');
    expect(source).toContain("Global control escape");
  });

  it("keeps Dashboard reachable even when the page tree crashes", () => {
    const source = readFileSync("client/src/components/ErrorBoundary.tsx", "utf8");
    expect(source).toContain('window.location.href = "/dashboard"');
    expect(source).not.toContain('window.location.href = "/mission-control"');
    expect(source).toContain("Dashboard");
  });

  it("keeps the not-found Dashboard action on the same canonical route", () => {
    const source = readFileSync("client/src/pages/NotFound.tsx", "utf8");
    expect(source).toContain('setLocation("/dashboard")');
    expect(source).toContain("Return to Dashboard");
  });
});
