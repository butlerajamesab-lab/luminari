import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Civic Map intake client boundary", () => {
  it("accepts only same-origin messages from the rendered Civic Map iframe", () => {
    const page = source("client/src/pages/CivicMap.tsx");

    expect(page).toContain('"luminari:civic-map:intake-request"');
    expect(page).toContain("event.origin !== window.location.origin");
    expect(page).toContain("event.source !== iframeRef.current?.contentWindow");
    expect(page).toContain("isCivicMapIntakeRequest(event.data)");
    expect(page).toContain("Number.isFinite(lat)");
    expect(page).toContain("Number.isFinite(lng)");
    expect(page).toContain("lat >= -90");
    expect(page).toContain("lng >= -180");
    expect(page).toContain('window.addEventListener("message"');
    expect(page).toContain('window.removeEventListener("message"');
    expect(page).toContain("<MapIntakePanel");
  });

  it("emits one bounded message contract from explicit jurisdiction and resource actions", () => {
    const iframe = source("client/public/civicmap.html");

    expect(iframe).toContain('"luminari:civic-map:intake-request"');
    expect(iframe).toContain("window.parent.postMessage(");
    expect(iframe.match(/\.postMessage\(/g)).toHaveLength(1);
    expect(iframe).toContain("window.location.origin");
    expect(iframe).not.toMatch(/postMessage\([\s\S]*?,\s*["']\*["']\s*\)/);
    expect(iframe).toContain(
      '["jurisdiction", "resource"].includes(entryKind)',
    );
    expect(iframe).toContain("hasFiniteMapCoordinates(lat, lng)");
    expect(iframe).toContain("lat >= -90");
    expect(iframe).toContain("lng >= -180");
    expect(iframe).toMatch(/requestMapIntake\(\s*"jurisdiction"/);
    expect(iframe).toMatch(/requestMapIntake\(\s*"resource"/);
    expect(iframe).toContain('id="jurisdictionIntakeAction"');
    expect(iframe).toContain('id="resourceIntakeAction"');
    expect(iframe).toContain("candidate?.manual_map_eligible === true");
    expect(iframe).toContain("openResource(point.resource_entity_id, {");
    expect(iframe).toContain("lat: latitude");
    expect(iframe).toContain("lng: longitude");
  });

  it("keeps the panel on deterministic terminology and the snake-case router contract", () => {
    const panel = source("client/src/pages/MapIntakePanel.tsx");

    expect(panel).toContain("suggestions.resource_count");
    expect(panel).not.toContain("suggestions.resourceCount");
    expect(panel).toContain("Applying geographic intake rules...");
    expect(panel).not.toMatch(/\bAI\b|\bLLM\b|Analyzing geographic context/i);
  });
});
