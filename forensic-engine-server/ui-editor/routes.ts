/**
 * UI Editor REST Routes — /api/ui-editor/*
 * 
 * Direct REST endpoints for the UI Editor service.
 * These bypass tRPC and copilot artifacts for immediate execution.
 */
import type { Express, Request, Response } from "express";
import { uiReadFile, uiWriteFile, uiPatchFile, uiListFiles, uiGetChangeLog, uiRollbackLastWrite } from "./index";

export function registerUIEditorRoutes(app: Express) {
  // Read a file
  app.post("/api/ui-editor/read", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body;
      if (!filePath) return res.status(400).json({ success: false, error: "filePath required" });
      const result = await uiReadFile(filePath, "sovereign-control");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Write a file
  app.post("/api/ui-editor/write", async (req: Request, res: Response) => {
    try {
      const { filePath, content } = req.body;
      if (!filePath || content === undefined) return res.status(400).json({ success: false, error: "filePath and content required" });
      const result = await uiWriteFile(filePath, content, "sovereign-control");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Patch a file
  app.post("/api/ui-editor/patch", async (req: Request, res: Response) => {
    try {
      const { filePath, patches } = req.body;
      if (!filePath || !patches) return res.status(400).json({ success: false, error: "filePath and patches required" });
      const result = await uiPatchFile(filePath, patches, "sovereign-control");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // List files in a directory
  app.post("/api/ui-editor/list", async (req: Request, res: Response) => {
    try {
      const { dirPath } = req.body;
      const result = await uiListFiles(dirPath || "", "sovereign-control");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Get change log
  app.get("/api/ui-editor/log", async (_req: Request, res: Response) => {
    try {
      const log = uiGetChangeLog(50);
      res.json({ success: true, entries: log });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Rollback last write
  app.post("/api/ui-editor/rollback", async (_req: Request, res: Response) => {
    try {
      const result = uiRollbackLastWrite("sovereign-control");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Execute a ui_patch directly (same format as Sunam artifact content)
  app.post("/api/ui-editor/execute", async (req: Request, res: Response) => {
    try {
      const cmd = req.body;
      if (!cmd.action) return res.status(400).json({ success: false, error: "action required" });

      let result: any;
      switch (cmd.action) {
        case "read":
          result = await uiReadFile(cmd.filePath, "direct-api");
          break;
        case "write":
          result = await uiWriteFile(cmd.filePath, cmd.content, "direct-api");
          break;
        case "patch":
          result = await uiPatchFile(cmd.filePath, cmd.patches, "direct-api");
          break;
        case "list":
          result = await uiListFiles(cmd.dirPath || "", "direct-api");
          break;
        case "rollback":
          result = uiRollbackLastWrite("direct-api");
          break;
        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${cmd.action}` });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  console.log("[UIEditor] REST routes registered at /api/ui-editor/*");
}
