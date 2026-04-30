import express from "express";
import { createServer } from "http";
import net from "net";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "./context";
import { sessionMiddleware } from "./session-middleware";
import { serveStatic, setupVite } from "./vite";

function loadLocalRuntimeEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolvePort => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolvePort(true)));
    server.on("error", () => resolvePort(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  loadLocalRuntimeEnv();
  const { appRouter } = await import("../routers");

  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(sessionMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "luminari", backend: "express-trpc", supabaseProject: "wepxlinwbjrkqdzkqpar" });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log("[Startup] Full-stack Express + tRPC server ready");
  });

  process.on("SIGTERM", () => {
    console.log("[Shutdown] SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
