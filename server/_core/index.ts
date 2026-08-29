import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { requireExpressAdmin } from "./express-admin-middleware";
import { notificationRuntimeTrpcMiddleware } from "./notification-runtime-trpc-middleware";
import { requireAdminForServiceTrpcOperations } from "./trpc-service-admin-middleware";
import { sessionMiddleware } from "./session-middleware";
import { systemVisibilityRouter } from "../routes/system-visibility-router";
import { conveyorRouter } from "../routes/conveyor-router";
import { civicMapRouter } from "../routes/civic-map-router";
import { atlasProxyRouter } from "../routes/atlas-proxy-router";
import { atlas_domain3_receipt_router } from "../routes/atlas-domain3-receipt-router";
import { corpus_footprint_router } from "../routes/corpus-footprint-router";
import { ingestion_control_read_cache_router } from "../routes/ingestion_control_read_cache_router";
import { ingestion_control_rest_router } from "../routes/ingestion_control_router";
import { substrate_readiness_router } from "../routes/substrate_readiness_router";
import { docket_router } from "../routes/docket";
import { prism_verification_router } from "../routes/prism-verification-router";
import { civic_genome_export_router } from "../routes/civic-genome-export-router";
import { invite_redemption_router } from "../routes/invite-redemption-router";
import { registerUploadRoute } from "../upload-route";
import { registerExecutorRoutes } from "../executor-routes";
import { loadPipelineRegistry } from "../pipeline-resolver";
import { loadLensRegistry } from "../lens-engine";
import { serveStatic, setupVite } from "./vite";
import { livenessPayload, SUPABASE_PROJECT } from "./health-diagnostics";
import { registerSecurityHeaders } from "./security-headers";
import {
  background_feature_enabled,
  background_workers_allowed,
  resolve_lighthouse_runtime_role,
} from "../runtime-role";
import { expireStaleUploadSessions, getPool } from "../db";
import { initializeScheduler } from "../ingestion/scheduler";
import { run_with_database_request_context } from "../db-request-context";
import { run_rosetta_control_repair_from_environment } from "../civic-genome-rosetta-control-repair";
import { run_prism_rosetta_activation_from_environment } from "../services/prism-rosetta-startup-activation";
import { run_civic_genome_external_snapshot_proof_from_environment } from "../civic-genome-external-snapshot-startup-proof";
import { run_civic_genome_kaleidoscope_handoff_from_environment } from "../civic-genome-kaleidoscope-handoff-startup";
import { start_docket_state_cache_warmer } from "../docket-state-cache-warmer";
import "../services/fresh-state-enrichment-reconciliation-v1";
import "../services/fresh-corpus-atomic-startup";
import "../services/fresh-corpus-atomic-sql-recovery-startup";

const runtime_fingerprint = Object.freeze({
  render_git_commit: process.env.RENDER_GIT_COMMIT || null,
  render_service_id: process.env.RENDER_SERVICE_ID || null,
  render_service_name: process.env.RENDER_SERVICE_NAME || null,
  node_env: process.env.NODE_ENV || null,
  auth_context_profile_resolution: "eager_profile_lookup_v1",
  runtime_role: resolve_lighthouse_runtime_role(),
});

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function registerOptionalIntegrationStubs(app: express.Express) {
  if (!process.env.STRIPE_SECRET_KEY) console.warn("Stripe disabled: STRIPE_SECRET_KEY not configured");

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (_req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ ok: false, disabled: true, message: "Stripe webhook disabled: STRIPE_WEBHOOK_SECRET not configured" });
    }
    return res.status(503).json({ ok: false, disabled: true, message: "Stripe webhook handler not enabled" });
  });

  app.all("/api/stripe/*", (_req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ ok: false, disabled: true, message: "Stripe disabled: STRIPE_SECRET_KEY not configured" });
    }
    return res.status(503).json({ ok: false, disabled: true, message: "Stripe routes not enabled" });
  });

  app.all("/api/oauth/*", (_req, res) => {
    return res.status(503).json({ ok: false, disabled: true, message: "OAuth routes not enabled in this deployment" });
  });
}

function registerSlowRequestDiagnostics(app: express.Express) {
  app.use((req, res, next) => {
    const started_at = Date.now();
    let receipt_emitted = false;

    const emit_receipt = (completion_state: "finished" | "closed") => {
      if (receipt_emitted) return;
      receipt_emitted = true;

      const duration_ms = Date.now() - started_at;
      if (duration_ms < 2_000) return;

      const content_length = res.getHeader("content-length");
      const response_bytes = typeof content_length === "string"
        ? Number(content_length)
        : typeof content_length === "number"
          ? content_length
          : null;

      console.warn("[HTTP] slow_request", {
        method: req.method,
        path: req.path,
        status_code: res.statusCode,
        duration_ms,
        response_bytes: response_bytes !== null && Number.isFinite(response_bytes) ? response_bytes : null,
        completion_state,
        request_id: req.get("x-request-id") ?? req.get("x-render-request-id") ?? null,
      });
    };

    res.once("finish", () => emit_receipt("finished"));
    res.once("close", () => emit_receipt(res.writableEnded ? "finished" : "closed"));
    next();
  });
}

async function buildAdminDatabaseDiagnostic() {
  const pool = getPool();
  const [version_result, table_result, view_result, fk_result] = await Promise.all([
    pool.query("select version() as version"),
    pool.query("select count(*)::int as total from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"),
    pool.query("select count(*)::int as total from information_schema.views where table_schema = 'public'"),
    pool.query(`select count(*)::int as total
      from information_schema.table_constraints
      where table_schema = 'public' and constraint_type = 'FOREIGN KEY'`),
  ]);

  const database_version = String(version_result.rows[0]?.version ?? "").split(" ").slice(0, 2).join(" ") || null;
  const public_tables = Number(table_result.rows[0]?.total ?? 0);
  const views = Number(view_result.rows[0]?.total ?? 0);
  const foreign_keys = Number(fk_result.rows[0]?.total ?? 0);

  return {
    ok: true,
    database: "connected",
    database_url: process.env.DATABASE_URL ? "configured" : "missing",
    database_version,
    public_tables,
    db_diagnostic: {
      tables: { total: public_tables },
      views: { total: views },
      foreign_keys: { total: foreign_keys },
      errors: [],
    },
    supabase_project: SUPABASE_PROJECT,
    timestamp: new Date().toISOString(),
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  registerSecurityHeaders(app);
  registerSlowRequestDiagnostics(app);
  app.use((req, _res, next) => {
    run_with_database_request_context({
      method: req.method,
      path: req.path,
      request_id: req.get("x-request-id") ?? req.get("x-render-request-id") ?? null,
    }, next);
  });
  registerOptionalIntegrationStubs(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use(sessionMiddleware);
  app.use("/api/invites", invite_redemption_router);
  app.use(
    "/api/trpc",
    notificationRuntimeTrpcMiddleware,
    requireAdminForServiceTrpcOperations,
    createExpressMiddleware({ router: appRouter, createContext }),
  );

  const send_liveness = (_req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(livenessPayload());
  };

  // The repository Blueprint uses /api/health, while the current Render
  // service has drifted to /health. Keep both paths on the same cheap,
  // database-independent liveness handler so either configuration fails true.
  app.get("/health", send_liveness);
  app.get("/api/health", send_liveness);

  app.get("/api/runtime-build", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ ok: true, ...runtime_fingerprint });
  });

  app.get("/api/db-diagnostic", requireExpressAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      res.json(await buildAdminDatabaseDiagnostic());
    } catch (error) {
      res.status(503).json({
        ok: false,
        database: "unreachable",
        database_url: process.env.DATABASE_URL ? "configured" : "missing",
        database_version: null,
        public_tables: null,
        db_diagnostic: {
          tables: { total: null },
          views: { total: null },
          foreign_keys: { total: null },
          errors: [{ code: "database_diagnostic_failed", message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) }],
        },
        supabase_project: SUPABASE_PROJECT,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use("/api/corpus-footprint", requireExpressAdmin, corpus_footprint_router);
  app.use("/api/system", requireExpressAdmin, systemVisibilityRouter);
  app.use("/api/conveyor", requireExpressAdmin, conveyorRouter);
  app.use("/api/civic-map", civicMapRouter);
  app.use("/api/atlas", atlasProxyRouter);
  app.use("/api/atlas-domain3", atlas_domain3_receipt_router);
  app.use("/api/ingestion-control", requireExpressAdmin);
  app.use("/api/ingestion-control", ingestion_control_read_cache_router);
  app.use("/api/ingestion-control", substrate_readiness_router);
  app.use("/api/ingestion-control", ingestion_control_rest_router);
  app.use("/api/docket", docket_router);
  app.use("/api/prism", prism_verification_router);
  app.use("/api/civic-genome/export", civic_genome_export_router);
  registerUploadRoute(app);
  app.use("/api/executor", requireExpressAdmin);
  registerExecutorRoutes(app);

  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);

  server.listen(port, () => {
    console.log(`Luminari server running on http://localhost:${port}/`);
    console.log(`[Startup] Supabase project: ${SUPABASE_PROJECT}`);
    console.log("[Startup] Runtime fingerprint", runtime_fingerprint);
    try { loadPipelineRegistry(); console.log("[Startup] Pipeline registry loaded"); } catch (e) { console.error("[Startup] Pipeline registry error:", e); }
    try { loadLensRegistry(); console.log("[Startup] Lens registry loaded"); } catch (e) { console.error("[Startup] Lens registry error:", e); }

    if (background_workers_allowed()) {
      if (background_feature_enabled("UPLOAD_SESSION_EXPIRATION_ENABLED")) {
        void expireStaleUploadSessions().catch(error => {
          console.error("[Upload Lifecycle] startup expiration failed", error);
        });
      }
      void initializeScheduler()
        .then(() => console.log("[Startup] Ingestion scheduler initialized"))
        .catch(error => {
          console.error("[Startup] Ingestion scheduler initialization failed:", error);
        });
      start_docket_state_cache_warmer(port);
      void run_rosetta_control_repair_from_environment().catch(error => {
        console.error("[RosettaControlRepair] failed", error);
      });
      void run_prism_rosetta_activation_from_environment().catch(error => {
        console.error("[PrismRosettaActivation] failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message : "unknown",
        });
      });
      void run_civic_genome_external_snapshot_proof_from_environment().catch(error => {
        console.error("[CivicGenomeExternalSnapshotProof] failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message : "unknown",
        });
      });
      void run_civic_genome_kaleidoscope_handoff_from_environment().catch(error => {
        console.error("[CivicGenomeKaleidoscopeHandoff] failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message : "unknown",
        });
      });
    } else {
      console.log("[RuntimeRole] HTTP-only process; background startup denied", {
        ...resolve_lighthouse_runtime_role(),
      });
    }
  });

  process.on("SIGTERM", () => {
    console.log("[Shutdown] SIGTERM received, shutting down...");
    server.close(() => {
      console.log("[Shutdown] Server closed");
      process.exit(0);
    });
  });
}

startServer().catch(error => {
  console.error("[Startup] Server failed:", error);
  process.exit(1);
});
