import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const production_entry = read("server/_core/index.ts");
const scheduler = read("server/ingestion/scheduler.ts");
const ingestion_control = read("server/routes/ingestion_control_router.ts");
const docket_routes = read("server/routes/docket.ts");
const civic_genome_router = read("server/routers/civic-genome-router.ts");
const session76_router = read("server/routers/session76-router.ts");
const render_blueprint = read("render.yaml");
const pr_workflow = read(".github/workflows/pr-test.yml");

const guarded_worker_sources = [
  "server/civic-genome-legislative-version-queue-worker.ts",
  "server/services/prism-rosetta-queue-worker.ts",
  "server/civic-genome-rosetta-generation-queue-worker.ts",
  "server/civic-genome-rosetta-generation-target-sync.ts",
  "server/civic-genome-rosetta-generation-upgrade-worker.ts",
  "server/docket-jurisdiction-activation-queue-worker.ts",
  "server/civic-genome-final-source-reconciliation-worker.ts",
  "server/docket-state-cache-warmer.ts",
];

describe("Lighthouse web/background runtime boundary", () => {
  it("starts HTTP before any role-scoped scheduler bootstrap", () => {
    const listen_position = production_entry.indexOf("server.listen(port, () => {");
    const scheduler_position = production_entry.indexOf("void initializeScheduler()", listen_position);

    expect(listen_position).toBeGreaterThanOrEqual(0);
    expect(scheduler_position).toBeGreaterThan(listen_position);
    expect(production_entry).toContain("if (background_workers_allowed())");
    expect(production_entry).toContain("HTTP-only process; background startup denied");
    expect(production_entry).toContain("runtime_role: resolve_lighthouse_runtime_role()");
    const worker_boundary = production_entry.indexOf("if (background_workers_allowed())", listen_position);
    const upload_expiration_grant = production_entry.indexOf(
      'background_feature_enabled("UPLOAD_SESSION_EXPIRATION_ENABLED")',
      listen_position,
    );
    const upload_expiration = production_entry.indexOf("void expireStaleUploadSessions()", listen_position);
    expect(worker_boundary).toBeGreaterThan(listen_position);
    expect(upload_expiration_grant).toBeGreaterThan(worker_boundary);
    expect(upload_expiration).toBeGreaterThan(worker_boundary);
    expect(upload_expiration).toBeGreaterThan(upload_expiration_grant);
  });

  it("requires role plus an explicit positive flag for every default-on worker", () => {
    for (const path of guarded_worker_sources) {
      expect(read(path), path).toContain("background_feature_enabled(");
    }
  });

  it("keeps scheduled and manual ingestion out of the web process", () => {
    expect(scheduler).toContain('background_feature_enabled("INGESTION_SCHEDULER_ENABLED")');
    expect(scheduler).toContain('errors: ["background_runtime_required"]');
    expect(ingestion_control).toContain("ingestion_control_rest_router.use");
    expect(ingestion_control).toContain('"background_runtime_required"');
    expect(ingestion_control).toContain("background_workers_allowed()");
    expect(docket_routes).toContain('error: "background_runtime_required"');
    expect(docket_routes).toContain('source: "cache_stale_worker_paused"');
    expect(civic_genome_router).toContain("const workerAdminProcedure = adminProcedure.use");
    expect(civic_genome_router.match(/workerAdminProcedure/g)?.length).toBe(8);
    for (const mutation of [
      "reenableStream",
      "resetFailureCounters",
      "refreshSchedules",
      "resetCheckpoint",
      "forceReingestion",
    ]) {
      expect(session76_router, mutation).toMatch(
        new RegExp(`${mutation}: workerAdminProcedure`),
      );
    }
  });

  it("guards every import-time Fresh Corpus timer with a positive worker grant", () => {
    expect(read("server/services/fresh-corpus-atomic-startup.ts"))
      .toContain('background_feature_enabled("FRESH_ATOMIC_CORPUS_RESUME_ENABLED")');
    expect(read("server/services/fresh-state-enrichment-reconciliation-v1.ts"))
      .toContain('background_feature_enabled("FRESH_STATE_ENRICHMENT_RECONCILIATION_ENABLED")');
    expect(read("server/workers/corpus-import-queue-worker.ts"))
      .toContain('background_feature_enabled("FRESH_CORPUS_RECONCILIATION_ENABLED")');
  });

  it("declares a checks-gated, frozen, HTTP-only Render web service", () => {
    expect(render_blueprint).toContain("autoDeployTrigger: checksPass");
    expect(render_blueprint).toContain("corepack pnpm install --frozen-lockfile");
    expect(render_blueprint).toContain("healthCheckPath: /api/health");
    expect(render_blueprint).toMatch(/- key: LIGHTHOUSE_RUNTIME_ROLE\s+value: web/);
    expect(render_blueprint).not.toContain("--no-frozen-lockfile");
    expect(pr_workflow).toMatch(/push:\s+branches: \[main\]/);
    expect(pr_workflow).toContain("server/executor-runtime-boundary.test.ts");
  });
});
