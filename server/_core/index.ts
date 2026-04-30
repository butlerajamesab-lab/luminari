import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { lighthouseGateRouter } from "../lighthouse-gate-router";
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
      message: "Stripe webhook handler is not enabled for the current Lighthouse backend-lock gate",
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
      message: "Stripe routes are outside the current Lighthouse backend-lock gate",
    });
  });

  app.all("/api/oauth/*", (_req, res) => {
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "OAuth routes are outside the current Lighthouse backend-lock gate",
    });
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  registerOptionalIntegrationStubs(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const createGateContext = ({ req, res }: { req: express.Request; res: express.Response }) => ({
    req,
    res,
    user: null,
    isSystem: false,
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: lighthouseGateRouter,
      createContext: createGateContext,
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, supabaseProject: SUPABASE_PROJECT });
  });

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
    console.log(`Lighthouse gate server running on http://localhost:${port}/`);
    console.log(`[Startup] Lighthouse Supabase project: ${SUPABASE_PROJECT}`);
    console.log("[Startup] Legacy MySQL/TiDB routers and background jobs are not loaded for this gate");
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
  console.error("[Startup] Lighthouse gate server failed:", error);
  process.exit(1);
});
