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
    expect(index).toContain('app.get("/health", send_liveness)');
    expect(index).toContain('app.get("/api/health"');
  });
});
