import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("global dashboard escape", () => {
  it("keeps the platform Dashboard distinct from Case Overview", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    const catalog = readFileSync("client/src/pages/PlatformDashboard.tsx", "utf8");
    const layout = readFileSync("client/src/components/DashboardLayout.tsx", "utf8");
    const navigation = readFileSync("client/src/components/navigation.ts", "utf8");

    expect(app).toContain('<Route path="/dashboard"><DashboardRouter /></Route>');
    expect(app).toContain('<Route path="/dashboard" component={PlatformDashboard} />');
    expect(app).toContain('<Route path="/case-overview" component={Home} />');
    expect(app).not.toContain('<Route path="/dashboard" component={Home} />');
    expect(layout).toContain('setLocation("/case-overview")');
    expect(navigation).toContain(
      '{ icon: LayoutDashboard, label: "Case Overview", path: "/case-overview" }',
    );
    expect(navigation).toContain(
      '{ icon: Rocket, label: "Mission Control", path: "/mission-control" }',
    );
    expect(catalog).toContain("[...allNavSections, adminSection]");
    expect(app).toContain('<Route path="/" component={PublicEntry} />');
    expect(app).toContain('setLocation("/lighthouse", { replace: true });');
    expect(app).toContain('<Route path="/" component={PlatformDashboard} />');
    expect(app).not.toContain('navigate("/login", { replace: true })');
    expect(layout).not.toContain('if (!user) {\n    return (');
    expect(layout).toContain("Public browsing");
    expect(layout).toContain("Sign in to make changes");
    expect(catalog).toContain('navigate("/case-overview")');
    expect(catalog).toContain("Viewing and navigation are public");
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
