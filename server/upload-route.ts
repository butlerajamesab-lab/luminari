import type { Express, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { isSupabaseStorageKey, storageDelete, storageGet, storagePut } from "./storage";
import { nanoid } from "nanoid";
import * as dbHelpers from "./db";
import { createContext, require_resolved_user } from "./_core/context";
import { db } from "./db";
import { documents } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { cases } from "../drizzle/schema";

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

function buildDocumentAccessUrl(caseId: number, storageKey: string): string {
  const query = new URLSearchParams({ key: storageKey });
  return `/api/cases/${caseId}/documents/file?${query.toString()}`;
}

function resolvePersistedDocumentUrl(
  caseId: number,
  storedObject: { key: string; url: string },
): string {
  return isSupabaseStorageKey(storedObject.key)
    ? buildDocumentAccessUrl(caseId, storedObject.key)
    : storedObject.url;
}

async function authenticateCurrentRequest(req: Request, res: Response) {
  try {
    const ctx = await createContext({ req, res } as any);
    return await require_resolved_user(ctx);
  } catch {
    return null;
  }
}

export function registerUploadRoute(app: Express) {
  // Private case documents are exposed only through this authenticated bridge.
  // Existing Forge/CloudFront documents retain their historical direct URLs.
  app.get("/api/cases/:caseId/documents/file", async (req: Request, res: Response) => {
    try {
      const user = await authenticateCurrentRequest(req, res);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const caseId = parseInt(req.params.caseId);
      const storageKey = typeof req.query.key === "string" ? req.query.key : "";
      if (!caseId || isNaN(caseId) || !storageKey) {
        res.status(400).json({ error: "Valid caseId and document key are required" });
        return;
      }

      const [caseRow] = await db.select({ id: cases.id })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.userId, user.id)));
      if (!caseRow) {
        res.status(403).json({ error: "Access denied: you do not own this case" });
        return;
      }

      const [documentRow] = await db.select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        s3Key: documents.s3Key,
      })
        .from(documents)
        .where(and(eq(documents.caseId, caseId), eq(documents.s3Key, storageKey)));
      if (!documentRow) {
        res.status(404).json({ error: "Document storage object not found for this case" });
        return;
      }

      const { url } = await storageGet(documentRow.s3Key);
      res.setHeader("Cache-Control", "private, no-store");
      res.redirect(302, url);
    } catch (err: any) {
      console.error("[Upload] Document download bridge error:", err);
      res.status(500).json({ error: err.message || "Document download failed" });
    }
  });

  app.post("/api/upload", upload.array("files", MAX_BATCH_SIZE), async (req: Request, res: Response) => {
    try {
      const user = await authenticateCurrentRequest(req, res);
      if (!user) {
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
      } else {
        // Create new session
        sessionId = await dbHelpers.createUploadSession({
          caseId,
          userId: user.id,
          totalFiles: files.length,
        });
      }

      const results = [];

      for (const file of files) {
        try {
          // Compute SHA-256 (idempotency key)
          const sha256Hash = createHash("sha256").update(file.buffer).digest("hex");
          const fileType = classifyFileType(file.mimetype);

          // Check for duplicate (same hash + same case)
          const [existing] = await db.select()
            .from(documents)
            .where(and(eq(documents.sha256Hash, sha256Hash), eq(documents.caseId, caseId)));

          if (existing) {
            const existingResolution = (existing as any).documentResolution ?? "active";
            const isFailedPermanent = existing.status === "failed_permanent";
            const isResolved = ["corrupted", "excluded", "superseded"].includes(existingResolution);
            await dbHelpers.incrementUploadSessionCounter(sessionId, "duplicateFiles");
            results.push({
              id: existing.id,
              filename: file.originalname,
              fileType,
              sha256Hash,
              status: "duplicate",
              message: `Already uploaded as "${existing.filename}" (ID: ${existing.id})`,
              resolvedOriginal: (isFailedPermanent || isResolved) ? {
                documentId: existing.id,
                resolution: existingResolution,
                status: existing.status,
              } : undefined,
            });
            continue; // Skip to next file
          }

          const suffix = nanoid(8);
          const requestedStorageKey = `cases/${caseId}/documents/${sha256Hash.slice(0, 8)}-${suffix}-${file.originalname}`;

          // Upload to the configured document storage backend.
          const storedObject = await storagePut(requestedStorageKey, file.buffer, file.mimetype);
          const s3Key = storedObject.key;
          const s3Url = resolvePersistedDocumentUrl(caseId, storedObject);

          // Create document record
          const docId = await dbHelpers.createDocument({
            caseId,
            filename: file.originalname,
            fileType,
            mimeType: file.mimetype,
            fileSize: file.size,
            s3Key,
            s3Url,
            sha256Hash,
            snapshotId: null,
          });

          // Log audit
          await dbHelpers.logAudit({
            caseId,
            userId: user.id,
            action: "upload_document",
            targetType: "document",
            targetId: docId,
            details: { filename: file.originalname, fileType, fileSize: file.size, sha256Hash },
          });

          // Log pipeline event: document_uploaded
          dbHelpers.logPipelineEventByCase(caseId, "document_uploaded").catch(() => {});

          await dbHelpers.incrementUploadSessionCounter(sessionId, "completedFiles");
          results.push({
            id: docId,
            filename: file.originalname,
            fileType,
            sha256Hash,
            status: "uploaded",
          });
        } catch (err: any) {
          console.error(`[Upload] Failed to process ${file.originalname}:`, err);
          await dbHelpers.incrementUploadSessionCounter(sessionId, "failedFiles").catch(() => {});
          results.push({
            filename: file.originalname,
            error: err.message || "Upload failed",
          });
        }
      }

      // ── Post-upload integrity check ──
      const successCount = results.filter(r => r.status === "uploaded").length;
      const duplicateCount = results.filter(r => r.status === "duplicate").length;
      const errorCount = results.filter(r => r.error).length;

      // Finalize session if this is a single-batch upload (no sessionId param)
      if (!sessionIdParam) {
        await dbHelpers.finalizeUploadSession(sessionId);
      }

      // Verify actual DB count for this case
      const [dbCount] = await db.select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(eq(documents.caseId, caseId));

      res.json({
        documents: results,
        sessionId,
        summary: {
          total: results.length,
          uploaded: successCount,
          duplicates: duplicateCount,
          errors: errorCount,
          caseDocumentCount: dbCount?.count ?? 0,
          caseId,
        },
      });
    } catch (err: any) {
      console.error("[Upload] Route error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  // ── Scoped Replacement Upload: POST /api/upload/replace/:documentId ──
  // Accepts a single replacement upload, supersedes the original, creates the
  // canonical source registration, and links the immutable replacement chain.
  app.post("/api/upload/replace/:documentId", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const user = await authenticateCurrentRequest(req, res);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const documentId = parseInt(req.params.documentId);
      if (!documentId || isNaN(documentId)) {
        res.status(400).json({ error: "Invalid documentId" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Check eligibility
      const eligibility = await dbHelpers.checkReplacementEligibility(documentId);
      if (!eligibility.eligible || !eligibility.document) {
        res.status(400).json({ error: eligibility.reason || "Document not eligible for replacement" });
        return;
      }

      const originalDoc = eligibility.document;
      const caseId = originalDoc.caseId;

      // Ownership verification
      const [caseRow] = await db.select({ id: cases.id, userId: cases.userId })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.userId, user.id)));
      if (!caseRow) {
        res.status(403).json({ error: "Access denied: you do not own this case" });
        return;
      }

      // Compute SHA-256
      const sha256Hash = createHash("sha256").update(file.buffer).digest("hex");
      const fileType = classifyFileType(file.mimetype);

      // Check if this hash matches any OTHER active document (reject if so)
      const [hashConflict] = await db.select()
        .from(documents)
        .where(and(
          eq(documents.sha256Hash, sha256Hash),
          eq(documents.caseId, caseId),
        ));
      if (hashConflict) {
        res.status(409).json({
          error: hashConflict.id === documentId ? "SAME_CONTENT" : "DUPLICATE_SOURCE",
          message: hashConflict.id === documentId
            ? "The replacement bytes are identical to the document being replaced."
            : `This file already exists as "${hashConflict.filename}" (ID: ${hashConflict.id}). Select that document as the replacement instead.`,
        });
        return;
      }

      // Upload to the configured document storage backend.
      const suffix = nanoid(8);
      const requestedStorageKey = `cases/${caseId}/documents/${sha256Hash.slice(0, 8)}-${suffix}-${file.originalname}`;
      const storedObject = await storagePut(requestedStorageKey, file.buffer, file.mimetype);
      const s3Key = storedObject.key;
      const s3Url = resolvePersistedDocumentUrl(caseId, storedObject);

      let newDocumentId: number;
      try {
        newDocumentId = await dbHelpers.createAndSupersedeDocumentAtomic(
          documentId,
          {
            caseId,
            filename: file.originalname,
            fileType,
            mimeType: file.mimetype,
            fileSize: file.size,
            s3Key,
            s3Url,
            sha256Hash,
            snapshotId: null,
          },
          user.id,
          "Explicit replacement upload registered with the Universal Intake Spine",
        );
      } catch (persistenceError) {
        // COMMIT acknowledgement can be lost after PostgreSQL has durably
        // committed. Reconcile on a separate pool round-trip before deleting
        // bytes that a committed replacement may already reference.
        let committedReplacementId: number | null;
        try {
          committedReplacementId = await dbHelpers.findCommittedDocumentReplacement(
            documentId,
            caseId,
            s3Key,
          );
        } catch (reconciliationError) {
          console.error(
            `[Upload] Replacement commit status is ambiguous for key=${s3Key}; retaining bytes:`,
            reconciliationError,
          );
          const ambiguousCommitError = new Error(
            "Replacement commit status could not be verified; uploaded evidence was retained",
          ) as Error & { cause?: unknown };
          ambiguousCommitError.cause = persistenceError;
          throw ambiguousCommitError;
        }

        if (committedReplacementId !== null) {
          newDocumentId = committedReplacementId;
        } else {
          try {
            await storageDelete(s3Key);
          } catch (cleanupError) {
            console.error(
              `[Upload] Replacement persistence and storage compensation both failed for key=${s3Key}:`,
              cleanupError,
            );
            const compensationError = new Error(
              "Replacement persistence failed and uploaded object cleanup also failed",
            ) as Error & { cause?: unknown };
            compensationError.cause = persistenceError;
            throw compensationError;
          }
          throw persistenceError;
        }
      }

      res.json({
        success: true,
        originalDocumentId: documentId,
        newDocumentId,
        filename: file.originalname,
        sha256Hash,
        message: `Replaced document #${documentId} ("${originalDoc.filename}") — source registered for explicit Intake Spine execution`,
      });
    } catch (err: any) {
      console.error("[Upload] Replace route error:", err);
      res.status(500).json({ error: err.message || "Replacement upload failed" });
    }
  });
}
