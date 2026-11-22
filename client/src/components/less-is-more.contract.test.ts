import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Owner direction 2026-11-22 ("less is more"): every page already carries
// its own title, so shared chrome names nothing twice, stacks nothing, and
// floats exactly one button. These contracts pin that shape.
describe("less-is-more chrome contracts", () => {
  it("floats exactly one corner button: the helper; the Dashboard escape is a panel row", () => {
    const helper = readFileSync("client/src/components/LuminariHelper.tsx", "utf8");
    // The second floating button (the grid at right-20) is gone.
    expect(helper).not.toContain("right-20");
    // The escape survives as the panel's first row, beside the read-aloud row.
    expect(helper).toContain("Return to Dashboard");
    expect(helper).toContain("Read aloud");
    expect(helper).toContain("toggleReadAloud");
    expect(helper).toContain('navigate("/dashboard")');
  });

  it("keeps no permanent floating speaker button; only Stop reading floats, while speaking", () => {
    const source = readFileSync("client/src/contexts/ClickToReadContext.tsx", "utf8");
    expect(source).not.toContain("Enable click-to-read accessibility mode");
    expect(source).toContain("Stop reading");
    expect(source).toContain("if (!isSpeaking) return null;");
  });

  it("renders toasts top-center, never under the corner button", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    expect(app).toContain('<Toaster position="top-center" />');
  });

  it("puts the map zoom at the top-right and lifts the status pill clear of the corner", () => {
    const map = readFileSync("client/public/civicmap.html", "utf8");
    expect(map).toContain("zoomControl: false");
    expect(map).toContain('L.control.zoom({ position: "topright" })');
    expect(map).not.toContain("margin-top: 72px");
    expect(map).not.toContain("margin-top: 68px");
    expect(map).toContain("bottom: 84px");
    // The fixed topbar owns the frame's top edge: the zoom's corner
    // container is offset by the topbar height, not slid underneath it.
    expect(map).toContain(".leaflet-top.leaflet-right");
  });

  it("keeps read-aloud reachable in the direct-Docket shell, which has no helper", () => {
    const shell = readFileSync("client/src/DocketPublicApp.tsx", "utf8");
    expect(shell).toContain("useClickToRead");
    expect(shell).toContain("Read aloud");
    expect(shell).toContain('<Toaster position="top-center" />');
  });

  it("gives the Civic Map shell no duplicate Lighthouse back link", () => {
    const shell = readFileSync("client/src/pages/CivicMap.tsx", "utf8");
    expect(shell).not.toContain("ArrowLeft");
    expect(shell).toContain("Geographic view of the v3.13 Resource Directory");
  });
});
