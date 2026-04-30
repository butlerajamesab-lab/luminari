// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/lighthouse-gate-router.ts
import { z } from "zod";
import { Pool } from "pg";

// shared/const.ts
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var requireAdmin = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG
    });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var adminProcedure = t.procedure.use(requireAdmin);

// server/lighthouse-gate-router.ts
var SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";
var pool = null;
var warnedMissingDatabaseUrl = false;
function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (!warnedMissingDatabaseUrl) {
      console.warn("[LighthouseGate] DATABASE_URL not configured; Supabase-backed routes will return safe empty results.");
      warnedMissingDatabaseUrl = true;
    }
    pool = new Pool({ connectionString: "postgresql://invalid" });
    return pool;
  }
  pool = new Pool({ connectionString });
  pool.on("error", (err) => {
    console.error("[LighthouseGate] Unexpected PostgreSQL pool error:", err);
  });
  console.log(`[LighthouseGate] Supabase PostgreSQL pool initialized for project ${SUPABASE_PROJECT}.`);
  return pool;
}
function mapPgError(error) {
  if (!process.env.DATABASE_URL) {
    return { status: "unconfigured", message: "DATABASE_URL is not configured for direct PostgreSQL access." };
  }
  if (error?.code === "42P01") {
    return { status: "missing_table", message: "Lighthouse table is not present in this Supabase project." };
  }
  return { status: "error", message: error?.message || "Supabase PostgreSQL query failed." };
}
async function safeRestSelect(table, limit, offset) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      items: [],
      source: "supabase_rest",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: "unconfigured",
      message: "Backend Supabase REST access is not configured."
    };
  }
  try {
    const boundedLimit = Math.max(1, Math.min(limit || 50, 100));
    const boundedOffset = Math.max(0, offset || 0);
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", String(boundedLimit));
    url.searchParams.set("offset", String(boundedOffset));
    url.searchParams.set("order", "id.desc");
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json"
      }
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : [];
    if (!response.ok) {
      const message = Array.isArray(parsed) ? response.statusText : parsed?.message || response.statusText;
      const status = response.status === 404 || String(message).toLowerCase().includes("could not find") ? "missing_table" : "error";
      return {
        items: [],
        source: "supabase_rest",
        supabaseProject: SUPABASE_PROJECT,
        table,
        status,
        message: status === "missing_table" ? "Lighthouse table is not present in this Supabase project." : message
      };
    }
    const rows = Array.isArray(parsed) ? parsed : [];
    return {
      items: rows,
      source: "supabase_rest",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: rows.length > 0 ? "ok" : "empty"
    };
  } catch (error) {
    return {
      items: [],
      source: "supabase_rest",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: "error",
      message: error?.message || "Supabase REST query failed."
    };
  }
}
async function safeSelect(table, limit, offset, whereSql = "", values = []) {
  try {
    const boundedLimit = Math.max(1, Math.min(limit || 50, 100));
    const boundedOffset = Math.max(0, offset || 0);
    const sql = `select * from ${table} ${whereSql} order by id desc limit $${values.length + 1} offset $${values.length + 2}`;
    const result = await getPool().query(sql, [...values, boundedLimit, boundedOffset]);
    return {
      items: result.rows,
      source: "supabase_postgres",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: result.rows.length > 0 ? "ok" : "empty"
    };
  } catch (error) {
    const mapped = mapPgError(error);
    console.warn(`[LighthouseGate] ${table} PostgreSQL query returned ${mapped.status}: ${mapped.message}`);
    const fallback = await safeRestSelect(table, limit, offset);
    if (fallback.status === "ok" || fallback.status === "empty" || fallback.status === "missing_table") {
      if (mapped.status !== "missing_table") {
        fallback.message = fallback.message || `Direct PostgreSQL query was unavailable; verified through backend-only Supabase REST fallback.`;
      }
      return fallback;
    }
    return {
      items: [],
      source: "supabase_postgres",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: mapped.status,
      message: mapped.message
    };
  }
}
var suggestionsRouter = router({
  list: publicProcedure.input(z.object({
    status: z.enum(["pending", "reviewed", "accepted", "implemented", "declined"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0)
  }).optional()).query(({ input }) => {
    const values = [];
    let where = "";
    if (input?.status) {
      values.push(input.status);
      where = "where status = $1";
    }
    return safeSelect("lighthouse_suggestions", input?.limit ?? 50, input?.offset ?? 0, where, values);
  })
});
var spotlightRouter = router({
  list: publicProcedure.input(z.object({ activeOnly: z.boolean().default(true) }).optional()).query(({ input }) => {
    if (input?.activeOnly ?? true) {
      return safeSelect("lighthouse_spotlight", 50, 0, "where active = $1", [true]);
    }
    return safeSelect("lighthouse_spotlight", 50, 0);
  })
});
var jobsRouter = router({
  list: publicProcedure.input(z.object({
    status: z.enum(["active", "filled", "expired", "draft"]).optional(),
    category: z.enum(["trades", "healthcare", "social_services", "legal", "education", "technology", "general"]).optional(),
    stateCode: z.string().max(2).optional(),
    jobType: z.enum(["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0)
  }).optional()).query(({ input }) => {
    const clauses = [];
    const values = [];
    const addClause = (column, value) => {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    };
    addClause("status", input?.status ?? "active");
    if (input?.category) addClause("category", input.category);
    if (input?.stateCode) addClause("state_code", input.stateCode.toUpperCase());
    if (input?.jobType) addClause("job_type", input.jobType);
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return safeSelect("lighthouse_jobs", input?.limit ?? 50, input?.offset ?? 0, where, values);
  })
});
var postsRouter = router({
  list: publicProcedure.input(z.object({
    category: z.enum(["ask_help", "offer_help", "skill_share", "resource_share", "general"]).optional(),
    stateCode: z.string().max(2).optional(),
    status: z.enum(["active", "resolved", "expired", "flagged", "removed"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0)
  }).optional()).query(({ input }) => {
    const clauses = [];
    const values = [];
    const addClause = (column, value) => {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    };
    addClause("status", input?.status ?? "active");
    if (input?.category) addClause("category", input.category);
    if (input?.stateCode) addClause("state_code", input.stateCode.toUpperCase());
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return safeSelect("lighthouse_posts", input?.limit ?? 50, input?.offset ?? 0, where, values);
  })
});
var eventsRouter = router({
  list: publicProcedure.input(z.object({
    status: z.enum(["upcoming", "active", "completed", "cancelled"]).optional(),
    stateCode: z.string().max(2).optional(),
    eventType: z.enum(["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0)
  }).optional()).query(({ input }) => {
    const clauses = [];
    const values = [];
    const addClause = (column, value) => {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    };
    if (input?.status) addClause("status", input.status);
    if (input?.stateCode) addClause("state_code", input.stateCode.toUpperCase());
    if (input?.eventType) addClause("event_type", input.eventType);
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return safeSelect("lighthouse_events", input?.limit ?? 50, input?.offset ?? 0, where, values);
  })
});
var lighthouseGateRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    supabaseProject: SUPABASE_PROJECT
  })),
  lighthouse: router({
    suggestions: suggestionsRouter,
    spotlight: spotlightRouter,
    jobs: jobsRouter,
    posts: postsRouter,
    events: eventsRouter
  })
});

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    reportCompressedSize: false
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const candidates = [
    path2.resolve(import.meta.dirname, "public"),
    path2.resolve(import.meta.dirname, "../..", "dist", "public"),
    path2.resolve(process.cwd(), "dist", "public"),
    path2.resolve(process.cwd(), "public")
  ];
  let distPath = candidates[0];
  for (const candidate of candidates) {
    if (fs2.existsSync(path2.join(candidate, "index.html"))) {
      distPath = candidate;
      break;
    }
  }
  console.log(`[Static] Serving from: ${distPath} (exists: ${fs2.existsSync(distPath)}, has index.html: ${fs2.existsSync(path2.join(distPath, "index.html"))})`);
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    }
  }));
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
var SUPABASE_PROJECT2 = "wepxlinwbjrkqdzkqpar";
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
function registerOptionalIntegrationStubs(app) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("Stripe disabled: STRIPE_SECRET_KEY not configured");
  }
  app.post("/api/stripe/webhook", express2.raw({ type: "application/json" }), (_req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        message: "Stripe webhook disabled: STRIPE_WEBHOOK_SECRET not configured"
      });
    }
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "Stripe webhook handler is not enabled for the current Lighthouse backend-lock gate"
    });
  });
  app.all("/api/stripe/*", (_req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        message: "Stripe disabled: STRIPE_SECRET_KEY not configured"
      });
    }
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "Stripe routes are outside the current Lighthouse backend-lock gate"
    });
  });
  app.all("/api/oauth/*", (_req, res) => {
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "OAuth routes are outside the current Lighthouse backend-lock gate"
    });
  });
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  registerOptionalIntegrationStubs(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  const createGateContext = ({ req, res }) => ({
    req,
    res,
    user: null,
    isSystem: false
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: lighthouseGateRouter,
      createContext: createGateContext
    })
  );
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, supabaseProject: SUPABASE_PROJECT2 });
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
    console.log(`[Startup] Lighthouse Supabase project: ${SUPABASE_PROJECT2}`);
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
startServer().catch((error) => {
  console.error("[Startup] Lighthouse gate server failed:", error);
  process.exit(1);
});
