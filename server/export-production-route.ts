import type { Express, Request, Response } from "express";

import { sdk } from "./_core/sdk";
import * as dbHelpers from "./db";
import {
  clearExportDownloadHeaders,
  ExportRequestError,
  loadCurrentCaseExportData,
  renderCaseReport,
  streamHtmlBundle,
  streamJsonExport,
  type CaseReportType,
} from "./export-current";

const REPORT_TYPES = new Set<CaseReportType>([
  "case-brief",
  "entity-report",
  "timeline-report",
  "relationship-report",
]);

export function parsePositiveIntegerQuery(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseOptionalSnapshotId(value: unknown): number | null {
  if (value === undefined || value === "0") return 0;
  return parsePositiveIntegerQuery(value);
}

function isReportType(value: string): value is CaseReportType {
  return REPORT_TYPES.has(value as CaseReportType);
}

export function registerExportRoute(app: Express): void {
  app.get("/api/export/:type", async (req: Request, res: Response) => {
    try {
      let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const caseId = parsePositiveIntegerQuery(req.query.caseId);
      if (caseId === null) {
        res.status(400).json({ error: "caseId is required" });
        return;
      }

      const userId = Number(user.id);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      let caseData: Awaited<ReturnType<typeof dbHelpers.verifyCaseOwnership>>;
      try {
        caseData = await dbHelpers.verifyCaseOwnership(caseId, userId);
      } catch {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const exportType = req.params.type;
      if (exportType === "json-dump") {
        const snapshotId = parseOptionalSnapshotId(req.query.snapshotId);
        if (snapshotId === null) {
          res
            .status(400)
            .json({ error: "snapshotId must be a positive integer" });
          return;
        }
        await streamJsonExport(res, caseData, caseId, {
          includeTextContent: req.query.includeText === "true",
          snapshotId,
        });
        return;
      }

      if (exportType === "full-bundle") {
        await streamHtmlBundle(res, caseData, caseId);
        return;
      }

      if (isReportType(exportType)) {
        const data = await loadCurrentCaseExportData(caseData, caseId);
        res.setHeader("Cache-Control", "private, no-store, max-age=0");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.status(200).type("html").send(renderCaseReport(exportType, data));
        return;
      }

      res.status(400).json({ error: "Unknown export type" });
    } catch (error: unknown) {
      console.error("[Export] Error:", error);
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      clearExportDownloadHeaders(res);
      if (error instanceof ExportRequestError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Export failed" });
    }
  });
}
