import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStripeWebhook } from "../stripe-webhook";
import { registerUploadRoute } from "../upload-route";
import { registerDocketUploadRoute } from "../docket-upload-route";
import { registerExportRoute } from "../export-production-route";
import { registerCdaExportRoute } from "../cda-export-route";
import { registerBundleSyncRoute } from "../bundle-sync";
import { registerBundleDownloadRoute } from "../bundle-download-route";
import { expireStaleUploadSessions } from "../db";
import { startDeadlineScheduler } from "../deadline-scheduler";
import { initializeScheduler } from "../ingestion/scheduler";
import { startOutcomeFeedbackScheduler } from "../outcome-feedback-scheduler";
import { loadPipelineRegistry } from "../pipeline-resolver";
import { loadLensRegistry } from "../lens-engine";
import { appRouter } from "../routers";
import { registerExecutorRoutes } from "../executor-routes";
import { registerUIEditorRoutes } from "../ui-editor/routes";
import { registerHealerRoutes } from "../healer-routes";
import { startHealer } from "../autonomous-healer";
import { startQuarterlyExportCron } from "../quarterly-export-cron";
import { initSunamExecutor, shutdownSunamExecutor } from "../sunam-executor";
import { startPipelineRunner, stopPipelineRunner } from "../pipeline-runner";
import { runIntegrityLockdown } from "../services/integrity-lockdown";
import { createContext } from "./context";
import { sessionMiddleware } from "./session-middleware";
import { serveStatic, setupVite } from "./vite";
import { requireExpressAdmin } from "../_core/express-admin-middleware";
import { systemVisibilityRouter } from "../routes/system-visibility-router";
import { conveyorRouter } from "../routes/conveyor-router";
import { civicMapRouter } from "../routes/civic-map-router";

let pipelineRunnerInterval: NodeJS.Timer | null = null;

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
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Stripe webhook needs raw body BEFORE json parser
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
  registerStripeWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Session middleware - MUST run before tRPC to populate req.session
  app.use(sessionMiddleware);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Multipart upload route
  registerUploadRoute(app);
  // Docket Room file upload route
  registerDocketUploadRoute(app);
  // Export report routes
  registerExportRoute(app);
  // CDA bundle export (streaming ZIP)
  registerCdaExportRoute(app);
  // Offline intake bundle sync
  registerBundleSyncRoute(app);
  // Bundle download route
  registerBundleDownloadRoute(app);
  // Direct executor REST routes
  registerExecutorRoutes(app);
  // UI Editor REST routes
  registerUIEditorRoutes(app);
  // Autonomous healer REST routes
  registerHealerRoutes(app);
  // System Visibility Layer — deterministic readonly administrator diagnostics
  app.use("/api/system", requireExpressAdmin, systemVisibilityRouter);
  // Conveyor Belt API — validate → promote → bridge → report
  app.use("/api/conveyor", conveyorRouter);
  // CivicMap rendering API — preview/detail/bounds, snake_case contracts
  app.use("/api/civic-map", civicMapRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Expire stale upload sessions on startup (non-blocking)
    // DISABLED FOR TESTING - Database not connected
    // expireStaleUploadSessions().catch(err => console.error("[Startup] Upload session expiration error:", err));
    // Load pipeline registry and lens registry (non-blocking)
    try {
      loadPipelineRegistry();
      console.log("[Startup] Pipeline registry loaded");
    } catch (err) {
      console.error("[Startup] Pipeline registry load error:", err);
    }
    try {
      loadLensRegistry();
      console.log("[Startup] Lens registry loaded");
    } catch (err) {
      console.error("[Startup] Lens registry load error:", err);
    }
    // Start FOIA deadline scheduler (checks every 24h, first run immediate)
    startDeadlineScheduler();
    // Start live data ingestion scheduler
    // DISABLED: Auto-start disabled to prevent socket crashes from broken external API endpoints.
    // Streams are triggered manually via Mission Control → Live Data → Ingest button.
    console.log("[Startup] Ingestion scheduler: manual-trigger mode only");
    // Start outcome feedback scheduler (runs every 6 hours, first run immediate)
    startOutcomeFeedbackScheduler();
    console.log("[Startup] Outcome feedback scheduler started");
    // Start autonomous healer (Sunam self-operating loop)
    startHealer();
    console.log("[Startup] Autonomous healer (Sunam) started");
    // Start Sunam autonomous executor (signal backfill with session loop)
    // DISABLED: Sunam backfill has undefined job definition - gate routes signals but backfill expects pattern extraction.
    // Re-enable after defining clear Sunam responsibilities.
    initSunamExecutor({
      enabled: false,
      intervalMs: 5 * 60 * 1000,
      batchSize: 100,
      maxRetries: 3,
    });
    console.log("[Startup] Sunam autonomous executor disabled (backfill job undefined)");
    // ─── INTEGRITY LOCKDOWN ─── validate all canonical tables are populated
    runIntegrityLockdown(false).catch(err => console.error("[IntegrityLockdown] Error:", err));
    // Start automatic pipeline runner (every 5 minutes)
    pipelineRunnerInterval = startPipelineRunner(5 * 60 * 1000);
    console.log("[Startup] Automatic pipeline runner started");
    // Start quarterly spine export cron (every 90 days — resilience backup)
    startQuarterlyExportCron();
    console.log("[Startup] Quarterly Spine Export cron scheduled (every 90 days)");
    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("[Shutdown] SIGTERM received, shutting down...");
      shutdownSunamExecutor();
      if (pipelineRunnerInterval) {
        stopPipelineRunner(pipelineRunnerInterval);
      }
      server.close(() => {
        console.log("[Shutdown] Server closed");
        process.exit(0);
      });
    });
  });
}

startServer().catch(console.error);
