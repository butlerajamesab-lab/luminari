/**
 * Docket Room — File Upload Route
 *
 * POST /api/docket/upload
 * Submission storage is not established in the live database. Keep this
 * authenticated boundary explicit and fail before reading or preserving
 * uploaded bytes so the system cannot create orphaned evidence objects.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";

export function registerDocketUploadRoute(app: Express) {
  app.post("/api/docket/upload", async (req: Request, res: Response) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.status(503).json({
      error: "Docket submission storage is unavailable.",
      code: "docket_submissions_table_not_established",
      retryable: false,
    });
  });
}
