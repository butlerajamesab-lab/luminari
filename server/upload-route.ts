import multer from "multer";
import { createHash } from "crypto";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import * as dbHelpers from "./db";
import { sdk } from "./_core/sdk";
import { db } from "./db";
import { documents } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { cases } from "../drizzle/schema";
import { ENGINE_VERSION } from "../shared/const";
import { enqueueDocument } from "./analysis-pipeline";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

function classifyFileType(mimeType: string): string {
  if (mimeType.startsWith("application/pdf") || mimeType === "application/msword" || mimeType.includes("wordprocessingml")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

// Server-enforced batch cap
const MAX_BATCH_SIZE = 50;

export function registerUploadRoute(app: Express) {
  app.post("/api/upload", upload.array("files", MAX_BATCH_SIZE), async (req: Request, res: Response) => {
    try {
      // Authenticate
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const caseId = parseInt(req.body.caseId);
      if (!caseId || isNaN(caseId)) {
        res.status(400).json({ error: "caseId is required" });
        return;
      }

      // ── Ownership verification: user must own this case ──
      const [caseRow] = await db.select({ id: cases.id, userId: cases.userId })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.userId, user.id)));
      if (!caseRow) {
        res.status(403).json({ error: "Access denied: you do not own this case" });
        return;
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files provided" });
        return;
      }

      // ── Gate 6: Resolve or create open snapshot for this case ──
      let snapshot = await dbHelpers.getOpenSnapshot(caseId);
      if (!snapshot) {
        const created = await dbHelpers.createCorpusSnapshot({
          caseId,
          engineVersion: ENGINE_VERSION,
          documentIds: [],
          documentHashes: {},
        });
        snapshot = await dbHelpers.getSnapshot(created.id);
      }
      const snapshotId = snapshot?.id || 0;

      // ── Server-side batch cap enforcement ──
      if (files.length > MAX_BATCH_SIZE) {
        res.status(400).json({
          error: "BATCH_LIMIT_EXCEEDED",
          message: `Maximum ${MAX_BATCH_SIZE} files per request. Received ${files.length}.`,
          maxAllowed: MAX_BATCH_SIZE,
          received: files.length,
        });
        return;
      }

      // ── Create or attach to upload session ──
      const sessionIdParam = req.body.sessionId ? parseInt(req.body.sessionId) : null;
      let sessionId: number;

      if (sessionIdParam) {
        // Attach to existing session (multi-batch upload)
        const existingSession = await dbHelpers.getUploadSession(sessionIdParam);
        if (!existingSession || existingSession.userId !== user.id || existingSession.caseId !== caseId) {
          res.status(400).json({ error: "Invalid or mismatched upload session" });
          return;
        }
        sessionId = sessionIdParam;