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
import { loadPipelineRegistry } from "../pipeline-resolver";
import { loadLensRegistry } from "../lens-engine";
import { serveStatic, setupVite } from "./vite";

const SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";

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

function registerOptionalIntegrationStubs(app: express.Express) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("Stripe disabled: STRIPE_SECRET_KEY not configured");
  }

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (_req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        message: "Stripe webhook disabled: STRIPE_WEBHOOK_SECRET not configured",
      });
    }
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "Stripe webhook handler not enabled",
    });
  });

  app.all("/api/stripe/*", (_req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        message: "Stripe disabled: STRIPE_SECRET_KEY not configured",
      });
    }
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "Stripe routes not enabled",
    });
  });

  app.all("/api/oauth/*", (_req, res) => {
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "OAuth routes not enabled in this deployment",
    });
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  registerOptionalIntegrationStubs(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Session middleware for auth — MUST run before tRPC
  app.use(sessionMiddleware);

  // tRPC API — full appRouter with all real endpoints
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, supabaseProject: SUPABASE_PROJECT });
  });

  // AI inspection routes — MUST be mounted before Vite/static serving
  app.use("/api/ai", aiInspectRouter);
  // Builder Visibility Layer — deterministic readonly introspection
  app.use("/api/system", systemVisibilityRouter);
  // Conveyor Belt API — validate → promote → bridge → report
  app.use("/api/conveyor", conveyorRouter);
  // CivicMap rendering API — preview/detail/bounds, snake_case contracts
  app.use("/api/civic-map", civicMapRouter);

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Luminari server running on http://localhost:${port}/`);
    console.log(`[Startup] Supabase project: ${SUPABASE_PROJECT}`);
    // Load pipeline and lens registries (non-blocking)
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