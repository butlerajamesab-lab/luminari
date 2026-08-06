import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operational REST administrator boundary", () => {
  const index = readFileSync("server/_core/index.ts", "utf8");
  const conveyor = readFileSync("server/routes/conveyor-router.ts", "utf8");
  const ingestion = readFileSync(
    "server/routes/ingestion_control_router.ts",
    "utf8"
  );
  const executor = readFileSync("server/executor-routes.ts", "utf8");
  const systemRouter = readFileSync("server/_core/systemRouter.ts", "utf8");
  const systemVisibility = readFileSync(
    "server/routes/system-visibility-router.ts",
    "utf8"
  );
  const missionControl = readFileSync("client/src/pages/MissionControl.tsx", "utf8");
  const atlasProxy = readFileSync("server/routes/atlas-proxy-router.ts", "utf8");
  const packageJson = readFileSync("package.json", "utf8");

  it("gates the complete Conveyor namespace before its router", () => {
    expect(index).toContain(
      'app.use("/api/conveyor", requireExpressAdmin, conveyorRouter)'
    );
    expect(index).not.toContain('app.use("/api/conveyor", conveyorRouter)');
    expect(conveyor).toContain('conveyorRouter.post("/promote"');
    expect(conveyor).toContain('conveyorRouter.post("/run"');
  });

  it("gates all ingestion-control routers at the namespace boundary", () => {
    const gate = index.indexOf(
      'app.use("/api/ingestion-control", requireExpressAdmin)'
    );
    const readCache = index.indexOf(
      'app.use("/api/ingestion-control", ingestion_control_read_cache_router)'
    );
    const readiness = index.indexOf(
      'app.use("/api/ingestion-control", substrate_readiness_router)'
    );
    const runtime = index.indexOf(
      'app.use("/api/ingestion-control", ingestion_control_rest_router)'
    );

    expect(gate).toBeGreaterThanOrEqual(0);
    expect(readCache).toBeGreaterThan(gate);
    expect(readiness).toBeGreaterThan(gate);
    expect(runtime).toBeGreaterThan(gate);
    expect(ingestion).toContain(
      'ingestion_control_rest_router.post("/corpus-import-queue/worker-drain"'
    );
    expect(ingestion).toContain(
      'ingestion_control_rest_router.post("/registry-entity-candidates/promote-apply"'
    );
  });

  it("gates executor mutations before route registration", () => {
    const gate = index.indexOf(
      'app.use("/api/executor", requireExpressAdmin)'
    );
    const registration = index.indexOf("registerExecutorRoutes(app)");

    expect(gate).toBeGreaterThanOrEqual(0);
    expect(registration).toBeGreaterThan(gate);
    expect(executor).toContain('app.post("/api/executor/run_stream"');
    expect(executor).toContain('app.post("/api/executor/backfill_stream"');
    expect(executor).toContain('app.post("/api/executor/reset_checkpoint"');
  });

  it("preserves public civic-reference routes outside the operational gate", () => {
    expect(index).toContain('app.use("/api/civic-map", civicMapRouter)');
    expect(index).toContain('app.use("/api/docket", docket_router)');
    expect(index).toContain('app.get("/api/health"');
  });

  it("preserves liveness, build identity, deep health, and the complete REST mount set", () => {
    expect(index).toContain('app.get("/api/runtime-build"');
    expect(index).toContain('"/api/db-diagnostic", "/api/system/health"');
    expect(index).toContain('error: "diagnostic_not_public"');
    expect(systemRouter).toContain("health: adminProcedure.query");
    expect(missionControl).toContain("trpc.system.health.useQuery");
    expect(missionControl).not.toContain('fetch("/api/db-diagnostic"');
    expect(index).toContain('"/api/trpc"');

    for (const mount of [
      'app.use("/api/invites", invite_redemption_router)',
      'app.use("/api/ai", aiInspectRouter)',
      'app.use("/api/system", requireExpressAdmin, systemVisibilityRouter)',
      'app.use("/api/conveyor", requireExpressAdmin, conveyorRouter)',
      'app.use("/api/civic-map", civicMapRouter)',
      'app.use("/api/atlas", atlasProxyRouter)',
      'app.use("/api/docket", docket_router)',
      'app.use("/api/prism", prism_verification_router)',
      "registerDocketUploadRoute(app)",
      "registerExportRoute(app)",
      "registerCdaExportRoute(app)",
      "registerBundleDownloadRoute(app)",
      "registerBundleSyncRoute(app)",
      "registerUploadRoute(app)",
      "registerExecutorRoutes(app)",
    ]) {
      expect(index).toContain(mount);
    }
  });

  it("uses one hardened entrypoint and fails unmatched APIs as bounded JSON", () => {
    expect(packageJson).toContain(
      '"dev": "NODE_ENV=development tsx watch server/_core/index.ts"'
    );
    expect(packageJson).not.toContain("tsx watch server/core/index.ts");

    const apiFallback = index.indexOf('app.use("/api", (_req, res) =>');
    const staticServing = index.indexOf("serveStatic(app)");
    expect(apiFallback).toBeGreaterThan(index.indexOf("registerExecutorRoutes(app)"));
    expect(staticServing).toBeGreaterThan(apiFallback);
    expect(index).toContain('error: "api_route_not_found"');
  });

  it("gates civic-cache and Atlas mutations without hiding their public reads", () => {
    for (const gate of [
      'app.use("/api/atlas/populate", requireExpressAdmin)',
      'app.use("/api/atlas/bridge-drain", requireExpressAdmin)',
      'app.use("/api/docket/warm-state", requireExpressAdmin)',
      'app.use("/api/docket/warm-next-batch", requireExpressAdmin)',
    ]) {
      expect(index).toContain(gate);
    }

    expect(index.indexOf('app.use("/api/atlas/populate", requireExpressAdmin)'))
      .toBeLessThan(index.indexOf('app.use("/api/atlas", atlasProxyRouter)'));
    expect(index.indexOf('app.use("/api/docket/warm-state", requireExpressAdmin)'))
      .toBeLessThan(index.indexOf('app.use("/api/docket", docket_router)'));
    expect(atlasProxy).toContain("AbortSignal.timeout(ATLAS_REQUEST_TIMEOUT_MS)");
  });

  it("reports the canonical route manifest instead of legacy-only mounts", () => {
    expect(systemVisibility).toContain("PLATFORM_ROUTE_PATHS.map");
    expect(systemVisibility).toContain("PLATFORM_ROUTE_INVENTORY_SHA256");
    expect(systemVisibility).toContain('path: "/api/docket/upload"');
    expect(systemVisibility).toContain('path: "/api/cda/export/:runId"');
    expect(systemVisibility).not.toContain('path: "/api/ui-editor/*"');
    expect(systemVisibility).not.toContain('path: "/api/healer/*"');
  });
});
