/**
 * Healer REST Routes — /api/healer/*
 * 
 * Exposes the autonomous healer for monitoring and manual trigger.
 */
import type { Express, Request, Response } from "express";
import {
  startHealer,
  stopHealer,
  runHealerCycle,
  getHealerStatus,
  getHealerLog,
} from "./autonomous-healer";

export function registerHealerRoutes(app: Express) {
  // GET /api/healer/status — current healer state
  app.get("/api/healer/status", async (_req: Request, res: Response) => {
    try {
      const status = getHealerStatus();
      res.json({ success: true, ...status });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/healer/start — start the autonomous loop
  app.post("/api/healer/start", async (_req: Request, res: Response) => {
    try {
      startHealer();
      res.json({ success: true, message: "Autonomous healer started" });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/healer/stop — stop the autonomous loop
  app.post("/api/healer/stop", async (_req: Request, res: Response) => {
    try {
      stopHealer();
      res.json({ success: true, message: "Autonomous healer stopped" });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/healer/runOnce — trigger a single cycle manually
  app.post("/api/healer/runOnce", async (_req: Request, res: Response) => {
    try {
      const actions = await runHealerCycle();
      res.json({ success: true, actionsThisCycle: actions.length, actions });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/healer/log — full action log
  app.get("/api/healer/log", async (_req: Request, res: Response) => {
    try {
      const log = getHealerLog();
      res.json({ success: true, totalActions: log.length, actions: log });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  console.log("[Healer] REST routes registered at /api/healer/*");
}
