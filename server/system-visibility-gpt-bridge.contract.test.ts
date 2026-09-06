import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("GPT system-visibility bridge contract", () => {
  const productionEntry = source("server/_core/index.ts");
  const developmentEntry = source("server/core/index.ts");
  const middleware = source("server/_core/express-admin-middleware.ts");
  const systemRouter = source("server/routes/system-visibility-router.ts");
  const renderer = source("tools/gpt-website-renderer/src/server.ts");

  it("mounts the scoped gate in both runtime entrypoints", () => {
    const mount =
      'app.use("/api/system", requireExpressAdminOrSystemReadToken, systemVisibilityRouter)';
    expect(productionEntry).toContain(mount);
    expect(developmentEntry).toContain(mount);
  });

  it("limits service-token authority to the two exact GET diagnostics", () => {
    expect(middleware).toContain('"/api/system/health"');
    expect(middleware).toContain('"/api/system/routes"');
    expect(middleware).toContain('req.method !== "GET"');
    expect(middleware).toContain("LIGHTHOUSE_SYSTEM_READ_TOKEN");
    expect(middleware).toContain("expected.length < 32");
    expect(middleware).toContain("timingSafeEqual");
    expect(middleware).not.toContain('"/api/system/schema",');
  });

  it("keeps protected diagnostic responses out of shared caches", () => {
    expect(systemRouter).not.toContain(
      'res.setHeader("Cache-Control", "public, max-age=120, must-revalidate")'
    );
    expect(systemRouter).toContain(
      'res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")'
    );
  });

  it("proxies only health and route inventory through the authenticated GPT gateway", () => {
    expect(renderer).toContain('"/v1/system/health"');
    expect(renderer).toContain('"/v1/system/routes"');
    expect(renderer).toContain('operationId: "getLighthouseSystemHealth"');
    expect(renderer).toContain('operationId: "getLighthouseSystemRoutes"');
    expect(renderer).toContain(
      '"x-lighthouse-system-read-token": config.lighthouseSystemReadToken'
    );
    expect(renderer).not.toContain('fetchSystemDiagnostic("/api/system/schema")');
  });
});
