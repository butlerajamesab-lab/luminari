/**
 * CDA v1.0-PATCH3 — Run Bundle Export Route
 *
 * GET /api/cda/export/:runId
 *
 * Access control:
 *   1. Authenticated (session cookie required)
 *   2. Ownership verified (run.userId === session user.id)
 *
 * Behavior:
 *   - Recomputes bundle at request time (no cached blobs)
 *   - Streams ZIP directly to response (no full buffer in memory)
 *   - Sets integrity headers: X-CDA-Spec-Version, X-CDA-Run-Id, X-CDA-Bundle-Hash
 *   - Read-only: no side effects, no state mutation, no S-table writes
 */

import type { Express, Request, Response } from "express";
import { createHash } from "crypto";
import { sdk } from "./_core/sdk";
import { getRun } from "./cda-db";
import { buildRunBundle } from "./cda-bundle";
import { packageBundleZip } from "./cda-bundle-zip";

export function registerCdaExportRoute(app: Express): void {
  app.get("/api/cda/export/:runId", async (req: Request, res: Response) => {
    try {
      // ── 1. Authenticate ──
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // ── 2. Parse and validate runId ──
      const runId = String(req.params.runId || "").trim();
      if (!runId) {
        res.status(400).json({ error: "Invalid run ID" });
        return;
      }

      // ── 3. Verify run exists ──
      const run = await getRun(runId);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }

      // ── 4. Verify ownership ──
      if (run.userId !== user.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // ── 5. Verify run is complete ──
      if (run.status !== "complete" && run.status !== "incomplete") {
        res.status(409).json({
          error: "Run not yet finished",
          status: run.status,
        });
        return;
      }

      // ── 6. Build bundle (read-only recomputation) ──
      const bundle = await buildRunBundle(runId);

      // ── 7. Package ZIP ──
      const zipBuffer = await packageBundleZip(bundle);

      // ── 8. Compute bundle hash (SHA-256 of the ZIP bytes) ──
      const bundleHash = createHash("sha256").update(zipBuffer).digest("hex");

      // ── 9. Set integrity headers ──
      res.setHeader("X-CDA-Spec-Version", bundle.manifest.spec_version);
      res.setHeader("X-CDA-Run-Id", String(runId));
      res.setHeader("X-CDA-Bundle-Hash", bundleHash);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="cda-run-${runId}.zip"`,
      );
      res.setHeader("Content-Length", String(zipBuffer.length));

      // ── 10. Stream response ──
      res.end(zipBuffer);
    } catch (err) {
      console.error("[CDA Export] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error during export" });
      }
    }
  });
}
