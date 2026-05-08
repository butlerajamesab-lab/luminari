import { Router } from "express";

const aiInspectRouter = Router();

const INSPECTION_MODE_ENABLED =
  process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true" ||
  process.env.LIGHTHOUSE_INSPECTION_MODE === "true" ||
  process.env.NODE_ENV !== "production";

const runtimeErrors: any[] = [];

function requireInspectionMode(req: any, res: any, next: any) {
  if (!INSPECTION_MODE_ENABLED) {
    return res.status(403).json({
      ok: false,
      error: "AI inspection mode is disabled",
    });
  }

  next();
}

function extractRoutes(stack: any[], prefix = ""): any[] {
  const routes: any[] = [];

  for (const layer of stack || []) {
    if (layer.route && layer.route.path) {
      routes.push({
        path: `${prefix}${layer.route.path}`,
        methods: Object.keys(layer.route.methods || {}).map(m => m.toUpperCase()),
      });
    } else if (layer.name === "router" && layer.handle?.stack) {
      routes.push(...extractRoutes(layer.handle.stack, prefix));
    }
  }

  return routes;
}

function recordRuntimeError(source: string, error: any) {
  runtimeErrors.unshift({
    source,
    message: error?.message || String(error),
    timestamp: new Date().toISOString(),
  });

  if (runtimeErrors.length > 100) {
    runtimeErrors.pop();
  }
}

process.on("uncaughtException", error => {
  recordRuntimeError("uncaughtException", error);
});

process.on("unhandledRejection", error => {
  recordRuntimeError("unhandledRejection", error);
});

aiInspectRouter.use(requireInspectionMode);

aiInspectRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-inspection",
    mode: "read_only",
    inspectionMode: true,
    timestamp: new Date().toISOString(),
  });
});

aiInspectRouter.get("/site-map", (_req, res) => {
  res.json({
    ok: true,
    pages: [
      "/lighthouse",
      "/mudroom",
      "/viewfinder",
      "/civicmap",
      "/mission-control",
      "/architecture-map",
      "/docket-room"
    ],
    systems: [
      "lighthouse",
      "atlas",
      "prism",
      "rosetta",
      "esquire"
    ],
    generatedAt: new Date().toISOString(),
  });
});

aiInspectRouter.get("/routes", (req: any, res) => {
  try {
    const app = req.app;
    const routerStack = app?._router?.stack || [];

    const routes = extractRoutes(routerStack);

    res.json({
      ok: true,
      routeCount: routes.length,
      generatedAt: new Date().toISOString(),
      routes,
    });
  } catch (error: any) {
    recordRuntimeError("route-enumeration", error);

    res.status(500).json({
      ok: false,
      error: error?.message || "Failed to enumerate routes",
    });
  }
});

aiInspectRouter.get("/errors", (_req, res) => {
  res.json({
    ok: true,
    totalErrors: runtimeErrors.length,
    generatedAt: new Date().toISOString(),
    errors: runtimeErrors,
  });
});

aiInspectRouter.get("/runtime", (_req, res) => {
  res.json({
    ok: true,
    app: "luminari-lighthouse",
    inspectionMode: true,
    nodeEnv: process.env.NODE_ENV || null,
    render: {
      serviceName: process.env.RENDER_SERVICE_NAME || null,
      gitCommit: process.env.RENDER_GIT_COMMIT || null,
    },
  });
});

export default aiInspectRouter;
