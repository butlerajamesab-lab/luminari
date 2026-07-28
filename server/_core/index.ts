import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sessionMiddleware } from "./session-middleware";
import { aiInspectRouter } from "../routes/ai-inspect-router";
import { systemVisibilityRouter } from "../routes/system-visibility-router";
import { conveyorRouter } from "../routes/conveyor-router";
import { civicMapRouter } from "../routes/civic-map-router";
import { atlasProxyRouter } from "../routes/atlas-proxy-router";
import { ingestion_control_read_cache_router } from "../routes/ingestion_control_read_cache_router";
import { ingestion_control_rest_router } from "../routes/ingestion_control_router";
import { substrate_readiness_router } from "../routes/substrate_readiness_router";
import { docket_router } from "../routes/docket";
import { invite_redemption_router } from "../routes/invite-redemption-router";
import { registerExecutorRoutes } from "../executor-routes";
import { loadPipelineRegistry } from "../pipeline-resolver";
import { loadLensRegistry } from "../lens-engine";
import { serveStatic, setupVite } from "./vite";
import { livenessPayload, sendDatabaseDiagnostic, SUPABASE_PROJECT } from "./health-diagnostics";
import { initializeScheduler } from "../ingestion/scheduler";

const runtime_fingerprint = Object.freeze({
  render_git_commit: process.env.RENDER_GIT_COMMIT || null,
  render_service_id: process.env.RENDER_SERVICE_ID || null,
  render_service_name: process.env.RENDER_SERVICE_NAME || null,
  node_env: process.env.NODE_ENV || null,
  auth_context_profile_resolution: "eager_profile_lookup_v1",
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
    res.on("finish", () => {
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
        response_bytes: Number.isFinite(response_bytes) ? response_bytes : null,
        request_id: req.get("x-request-id") ?? req.get("x-render-request-id") ?? null,
      });
    });
    next();
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  registerOptionalIntegrationStubs(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerSlowRequestDiagnostics(app);

  app.use(sessionMiddleware);
  app.use("/api/invites", invite_redemption_router);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext }),
  );

  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(livenessPayload());
  });

  app.get("/api/runtime-build", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ ok: true, ...runtime_fingerprint });
  });

  app.get("/api/db-diagnostic", async (req, res) => {
    const force_refresh = req.query.force === "1" || req.query.refresh === "1";
    if (force_refresh) await sendDatabaseDiagnostic(res, true);
    else await sendDatabaseDiagnostic(res);
  });

  app.get("/api/system/health", async (req, res) => {
    const force_refresh = req.query.force === "1" || req.query.refresh === "1";
    if (force_refresh) await sendDatabaseDiagnostic(res, true);
    else await sendDatabaseDiagnostic(res);
  });

  app.use("/api/ai", aiInspectRouter);
  app.use("/api/system", systemVisibilityRouter);
  app.use("/api/conveyor", conveyorRouter);
  app.use("/api/civic-map", civicMapRouter);
  app.use("/api/atlas", atlasProxyRouter);
  app.use("/api/ingestion-control", ingestion_control_read_cache_router);
  app.use("/api/ingestion-control", substrate_readiness_router);
  app.use("/api/ingestion-control", ingestion_control_rest_router);
  app.use("/api/docket", docket_router);
  registerExecutorRoutes(app);

  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);

  try {
    await initializeScheduler();
    console.log("[Startup] Ingestion scheduler initialized");
  } catch (error) {
    console.error("[Startup] Ingestion scheduler initialization failed:", error);
  }

  server.listen(port, () => {
    console.log(`Luminari server running on http://localhost:${port}/`);
    console.log(`[Startup] Supabase project: ${SUPABASE_PROJECT}`);
    console.log("[Startup] Runtime fingerprint", runtime_fingerprint);
    try { loadPipelineRegistry(); console.log("[Startup] Pipeline registry loaded"); } catch (e) { console.error("[Startup] Pipeline registry error:", e); }
    try { loadLensRegistry(); console.log("[Startup] Lens registry loaded"); } catch (e) { console.error("[Startup] Lens registry error:", e); }
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
