import { Router } from "express";

const aiInspectRouter = Router();

const INSPECTION_MODE_ENABLED =
  process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true" ||
  process.env.LIGHTHOUSE_INSPECTION_MODE === "true" ||
  process.env.NODE_ENV !== "production";

function requireInspectionMode(req: any, res: any, next: any) {
  if (!INSPECTION_MODE_ENABLED) {
    return res.status(403).json({
      ok: false,
      error: "AI inspection mode is disabled",
      hint: "Set VITE_LIGHTHOUSE_INSPECTION_MODE=true or LIGHTHOUSE_INSPECTION_MODE=true to enable read-only inspection endpoints.",
    });
  }

  next();
}

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

aiInspectRouter.get("/manifest", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-inspection",
    mode: "read_only",
    purpose: "Expose safe, structured runtime context for AI-assisted Lighthouse/Luminari inspection.",
    routes: [
      {
        method: "GET",
        path: "/api/ai/health",
        description: "Confirms inspection endpoint is mounted before Vite/static fallback.",
      },
      {
        method: "GET",
        path: "/api/ai/manifest",
        description: "Returns the inspection endpoint manifest.",
      },
      {
        method: "GET",
        path: "/api/ai/runtime",
        description: "Returns safe runtime metadata only; no secrets, no database mutation.",
      },
    ],
    safety: {
      readOnly: true,
      exposesSecrets: false,
      mutatesDatabase: false,
      productionAuthBypass: false,
    },
  });
});

aiInspectRouter.get("/runtime", (_req, res) => {
  res.json({
    ok: true,
    app: "luminari-lighthouse",
    nodeEnv: process.env.NODE_ENV || null,
    inspectionMode: true,
    render: {
      serviceName: process.env.RENDER_SERVICE_NAME || null,
      gitCommit: process.env.RENDER_GIT_COMMIT || null,
      gitBranch: process.env.RENDER_GIT_BRANCH || null,
      externalHostname: process.env.RENDER_EXTERNAL_HOSTNAME || null,
    },
    flags: {
      viteLighthouseInspectionMode:
        process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true",
      lighthouseInspectionMode:
        process.env.LIGHTHOUSE_INSPECTION_MODE === "true",
    },
    safety: {
      readOnly: true,
      secretsRedacted: true,
    },
    timestamp: new Date().toISOString(),
  });
});

export default aiInspectRouter;
