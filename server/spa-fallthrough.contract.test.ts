import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRegisteredClientRoute } from "../shared/client-route-registry";
import {
  LIGHTHOUSE_FAVICON_ICO,
  LIGHTHOUSE_SITEMAP_XML,
} from "./_core/platform-static-documents";

describe("SPA fallthrough contract", () => {
  it("recognizes concrete parameterized client routes", () => {
    expect(isRegisteredClientRoute("/cases/123/control-room")).toBe(true);
    expect(isRegisteredClientRoute("/civic-genome/bill/2155699")).toBe(true);
    expect(isRegisteredClientRoute("/resource/42")).toBe(true);
    expect(isRegisteredClientRoute("/workbench/7")).toBe(true);
    expect(isRegisteredClientRoute("/cases/123/control-room/")).toBe(true);
  });

  it("does not turn unknown paths or unknown API endpoints into SPA routes", () => {
    expect(isRegisteredClientRoute("/this-route-does-not-exist")).toBe(false);
    expect(isRegisteredClientRoute("/api/docket")).toBe(false);
    expect(isRegisteredClientRoute("/cases/123/control-room/extra")).toBe(false);
  });

  it("keeps the server fallthrough behind the API and route-registry guards", () => {
    const vite_source = readFileSync("server/_core/vite.ts", "utf8");
    expect(vite_source).toContain(
      'pathname === "/api" || pathname.startsWith("/api/")',
    );
    expect(vite_source).toContain("isRegisteredClientRoute(pathname)");
    expect(vite_source).toContain("mountPlatformStaticDocuments(app)");
  });

  it("serves a real sitemap and ICO payload", () => {
    expect(LIGHTHOUSE_SITEMAP_XML).toContain(
      "https://lighthouse.columbiacitycustomllc.com/",
    );
    expect(LIGHTHOUSE_SITEMAP_XML).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(LIGHTHOUSE_FAVICON_ICO.length).toBeGreaterThan(100);
    expect([...LIGHTHOUSE_FAVICON_ICO.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  });
});
