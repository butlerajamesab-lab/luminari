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
