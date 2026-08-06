/**
 * Bundle Download Route — GET /api/bundle/download
 *
 * Serves the compiled offline intake bundle as a downloadable HTML file.
 * Requires authentication (the bundle contains the user's Luminari URL pre-filled).
 */

import { Express, Request, Response } from "express";
import { authenticateRequestUser } from "./_core/request-auth";
import { generateBundleBuffer } from "./bundle-generator";
import { logAudit } from "./db";

export function registerBundleDownloadRoute(app: Express) {
  app.get("/api/bundle/download", async (req: Request, res: Response) => {
    try {
      // Authenticate — the bundle is personalized with the user's Luminari URL
      let user;
      try {
        user = await authenticateRequestUser(req, res);
      } catch {
        res.status(401).json({ error: "Unauthorized — please log in first" });
        return;
      }

      // Build the sync URL from the request origin
      const origin = req.headers.origin || req.headers.referer?.replace(/\/+$/, "") || "";
      const syncUrl = origin || "";

      const buffer = generateBundleBuffer({ syncUrl });

      // Audit trail
      await logAudit({
        userId: user.id,
        action: "bundle_download",
        details: { syncUrl, bundleSize: buffer.length },
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="luminari-intake.html"');
      res.setHeader("Content-Length", buffer.length.toString());
      res.setHeader("Cache-Control", "no-store");
      res.send(buffer);
    } catch (err: unknown) {
      console.error("[BundleDownload] Error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
}
