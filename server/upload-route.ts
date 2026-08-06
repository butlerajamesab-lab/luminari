import type { Express, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { isSupabaseStorageKey, storageGet, storagePut } from "./storage";
import * as dbHelpers from "./db";
import { db } from "./db";
import { documents } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { cases } from "../drizzle/schema";
import { ENGINE_VERSION } from "../shared/const";
import { authenticateRequestUser } from "./_core/request-auth";
import {
  isIntakeTransactionCommitUncertainError,
  preserveDocumentInIntakeSpine,
  quarantineDocumentUploadIntent,
  registerDocumentUploadIntent,
} from "./intake-spine-runtime";

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

async function removeUnpreservedDocumentProjection(
  documentId: number,
  caseId: number,
  sha256Hash: string,
): Promise<void> {
  await db.delete(documents).where(and(
    eq(documents.id, documentId),
    eq(documents.caseId, caseId),
    eq(documents.sha256Hash, sha256Hash),
  ));
}

function uploadFailureCode(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 256);
  return "upload_failed_without_receipt";
}

export function registerUploadRoute(app: Express) {
  // Private case documents are exposed only through this authenticated bridge.
  // Existing Forge/CloudFront documents retain their historical direct URLs.
  app.get("/api/cases/:caseId/documents/file", async (req: Request, res: Response) => {
    try {
      let user;
      try {
        user = await authenticateRequestUser(req, res);
      } catch {
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

      const { url } = await storageGet(documentRow.s3Key, {
        download_filename: req.query.download === "1" ? documentRow.filename : undefined,
      });
      res.setHeader("Cache-Control", "private, no-store");
      if (req.query.response === "json") {
        res.status(200).json({
          url,
          filename: documentRow.filename,
          expires_in_seconds: 15 * 60,
        });
        return;
      }
      res.redirect(302, url);
    } catch (err: any) {
      console.error("[Upload] Document download bridge error:", err);
      res.status(500).json({ error: err.message || "Document download failed" });
    }
  });

  app.post("/api/upload", upload.array("files", MAX_BATCH_SIZE), async (req: Request, res: Response) => {
    try {
      // Authenticate
      let user;
      try {
        user = await authenticateRequestUser(req, res);
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
      } else {
        // Create new session
        sessionId = await dbHelpers.createUploadSession({
          caseId,
          userId: user.id,
          totalFiles: files.length,
        });
      }

      const results: Array<Record<string, any>> = [];

      for (const file of files) {
        let sha256Hash: string | undefined;
        let intentRegistered = false;
        let unpreservedDocumentId: number | undefined;
        try {
          sha256Hash = createHash("sha256").update(file.buffer).digest("hex");
          const fileType = classifyFileType(file.mimetype);
          const requestedStorageKey = `cases/${caseId}/documents/by-sha256/${sha256Hash}`;

          // Register the durable recovery point before crossing the external
          // storage boundary. A failed write remains discoverable/quarantined.
          await registerDocumentUploadIntent({
            legacy_case_id: caseId,
            owner_user_id: user.id,
            entry_channel: "evidence_upload",
            source_label: `Upload session ${sessionId}`,
            filename: file.originalname,
            mime_type: file.mimetype,
            byte_size: file.size,
            sha256: sha256Hash,
            planned_storage_object_path: requestedStorageKey,
          });
          intentRegistered = true;

          // This write is also the addressability proof for duplicate/replay
          // requests. Full-hash conflicts are recovered by storagePut itself.
          const storedObject = await storagePut(requestedStorageKey, file.buffer, file.mimetype);
          const s3Key = storedObject.key;
          const s3Url = resolvePersistedDocumentUrl(caseId, storedObject);

          const matchingDocuments = await db.select()
            .from(documents)
            .where(and(eq(documents.sha256Hash, sha256Hash), eq(documents.caseId, caseId)));
          const existing = matchingDocuments.find((document: typeof documents.$inferSelect) =>
            ((document as any).documentResolution ?? "active") !== "superseded" &&
            document.snapshotId === snapshotId,
          );

          if (existing) {
            const existingResolution = (existing as any).documentResolution ?? "active";
            const isFailedPermanent = existing.status === "failed_permanent";
            const isResolved = ["corrupted", "excluded"].includes(existingResolution);

            if (isFailedPermanent || isResolved) {
              const replacementDocumentId = await dbHelpers.createDocument({
                caseId,
                filename: file.originalname,
                fileType,
                mimeType: file.mimetype,
                fileSize: file.size,
                s3Key,
                s3Url,
                sha256Hash,
                snapshotId,
              });
              unpreservedDocumentId = replacementDocumentId;
              const receipt = await preserveDocumentInIntakeSpine({
                legacy_case_id: caseId,
                owner_user_id: user.id,
                entry_channel: "evidence_upload",
                source_label: `Upload session ${sessionId}`,
                legacy_document_id: replacementDocumentId,
                snapshot_id: snapshotId,
                filename: file.originalname,
                mime_type: file.mimetype,
                byte_size: file.size,
                sha256: sha256Hash,
                storage_key: s3Key,
                replaces_legacy_document_id: existing.id,
                replacement_reason: isFailedPermanent
                  ? "receipt_backed_failed_document_replacement"
                  : `receipt_backed_${existingResolution}_document_replacement`,
              });
              unpreservedDocumentId = undefined;

              await dbHelpers.incrementUploadSessionCounter(sessionId, "completedFiles")
                .catch(error => console.error("[Upload] Session counter projection failed:", error));
              results.push({
                id: replacementDocumentId,
                filename: file.originalname,
                fileType,
                sha256Hash,
                status: "uploaded",
                message: `Preserved replacement for "${existing.filename}" (ID: ${existing.id})`,
                replacedDocId: existing.id,
                receipt,
              });
              continue;
            }

            const receipt = await preserveDocumentInIntakeSpine({
              legacy_case_id: caseId,
              owner_user_id: user.id,
              entry_channel: "evidence_upload",
              source_label: `Upload session ${sessionId}`,
              legacy_document_id: existing.id,
              snapshot_id: snapshotId,
              filename: existing.filename || file.originalname,
              mime_type: existing.mimeType || file.mimetype,
              byte_size: file.size,
              sha256: sha256Hash,
              storage_key: s3Key,
              legacy_document_access_url: s3Url,
              allow_legacy_storage_rebind: true,
            });

            await dbHelpers.incrementUploadSessionCounter(sessionId, "duplicateFiles")
              .catch(error => console.error("[Upload] Session counter projection failed:", error));
            results.push({
              id: existing.id,
              filename: file.originalname,
              fileType,
              sha256Hash,
              status: "duplicate",
              message: `Already preserved as "${existing.filename}" (ID: ${existing.id})`,
              receipt,
            });
            continue;
          }

          const documentId = await dbHelpers.createDocument({
            caseId,
            filename: file.originalname,
            fileType,
            mimeType: file.mimetype,
            fileSize: file.size,
            s3Key,
            s3Url,
            sha256Hash,
            snapshotId,
          });
          unpreservedDocumentId = documentId;
          const receipt = await preserveDocumentInIntakeSpine({
            legacy_case_id: caseId,
            owner_user_id: user.id,
            entry_channel: "evidence_upload",
            source_label: `Upload session ${sessionId}`,
            legacy_document_id: documentId,
            snapshot_id: snapshotId,
            filename: file.originalname,
            mime_type: file.mimetype,
            byte_size: file.size,
            sha256: sha256Hash,
            storage_key: s3Key,
          });
          unpreservedDocumentId = undefined;

          // These are compatibility projections only; the immutable receipt is
          // authoritative and their failure cannot reverse a durable success.
          await dbHelpers.logAudit({
            caseId,
            userId: user.id,
            action: "upload_document",
            targetType: "document",
            targetId: documentId,
            details: {
              filename: file.originalname,
              fileType,
              fileSize: file.size,
              sha256Hash,
              preservationReceiptHash: receipt.receipt_hash,
            },
          }).catch(error => console.error("[Upload] Legacy audit projection failed:", error));
          dbHelpers.logPipelineEventByCase(caseId, "document_uploaded").catch(() => {});
          await dbHelpers.incrementUploadSessionCounter(sessionId, "completedFiles")
            .catch(error => console.error("[Upload] Session counter projection failed:", error));

          results.push({
            id: documentId,
            filename: file.originalname,
            fileType,
            sha256Hash,
            status: "uploaded",
            receipt,
          });
        } catch (err: any) {
          console.error(`[Upload] Failed to process ${file.originalname}:`, err);
          if (
            unpreservedDocumentId &&
            sha256Hash &&
            !isIntakeTransactionCommitUncertainError(err)
          ) {
            await removeUnpreservedDocumentProjection(unpreservedDocumentId, caseId, sha256Hash)
              .catch(cleanupError => console.error("[Upload] Failed projection cleanup:", cleanupError));
          }
          if (intentRegistered && sha256Hash) {
            await quarantineDocumentUploadIntent({
              legacy_case_id: caseId,
              owner_user_id: user.id,
              entry_channel: "evidence_upload",
              source_label: `Upload session ${sessionId}`,
              sha256: sha256Hash,
              failure_code: uploadFailureCode(err),
              legacy_document_id: unpreservedDocumentId,
            }).catch(quarantineError => console.error("[Upload] Intent quarantine failed:", quarantineError));
          }
          await dbHelpers.incrementUploadSessionCounter(sessionId, "failedFiles").catch(() => {});
          results.push({
            filename: file.originalname,
            error: err.message || "Upload failed",
          });
        }
      }

      // ── Post-upload integrity check ──
      const overrideCount = results.filter(r => r.status === "uploaded" && (r as any).replacedDocId).length;
      const successCount = results.filter(r => r.status === "uploaded").length - overrideCount;
      const duplicateCount = results.filter(r => r.status === "duplicate").length;
      const errorCount = results.filter(r => r.error).length;
      const preservedCount = results.filter(r => (r as any).receipt?.preservation_state === "preserved").length;

      // Finalize session if this is a single-batch upload (no sessionId param)
      if (!sessionIdParam) {
        await dbHelpers.finalizeUploadSession(sessionId)
          .catch(error => console.error("[Upload] Session finalization projection failed:", error));
      }

      // This count is informational only and cannot reverse receipted success.
      let caseDocumentCount: number | null = null;
      try {
        const [dbCount] = await db.select({ count: sql<number>`count(*)` })
          .from(documents)
          .where(eq(documents.caseId, caseId));
        caseDocumentCount = dbCount?.count ?? 0;
      } catch (error) {
        console.error("[Upload] Case document count projection failed:", error);
      }

      res.json({
        documents: results,
        sessionId,
        summary: {
          total: results.length,
          uploaded: successCount,
          duplicates: duplicateCount,
          errors: errorCount,
          overrides: overrideCount,
          preserved: preservedCount,
          caseDocumentCount,
          caseId,
        },
      });
    } catch (err: any) {
      console.error("[Upload] Route error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  // ── Intentional Replacement Upload: POST /api/upload/replace/:documentId ──
  // Active, corrupted, excluded, and failed documents may be intentionally
  // superseded. The original is changed only inside the receipt transaction.
  app.post("/api/upload/replace/:documentId", upload.single("file"), async (req: Request, res: Response) => {
    try {
      // Authenticate
      let user;
      try {
        user = await authenticateRequestUser(req, res);
      } catch {
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

      // Resolve or create open snapshot
      let snapshot = await dbHelpers.getOpenSnapshot(caseId);
      if (!snapshot) {
        res.status(400).json({ error: "No open snapshot available — cannot replace in sealed state" });
        return;
      }
      const snapshotId = snapshot.id;
      if (originalDoc.snapshotId !== snapshotId) {
        res.status(409).json({
          error: "DOCUMENT_SNAPSHOT_NOT_OPEN",
          message: "The document does not belong to the current open snapshot and cannot be mutated.",
        });
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
      if (hashConflict && hashConflict.id !== documentId) {
        const conflictResolution = (hashConflict as any).documentResolution ?? "active";
        if (conflictResolution === "active" && hashConflict.status !== "failed_permanent") {
          res.status(409).json({
            error: "DUPLICATE_ACTIVE",
            message: `This file matches active document "${hashConflict.filename}" (ID: ${hashConflict.id}). Cannot replace — hash belongs to a different active document.`,
          });
          return;
        }
      }

      const requestedStorageKey = `cases/${caseId}/documents/by-sha256/${sha256Hash}`;
      let intentRegistered = false;
      let replacementDocumentId: number | undefined;
      try {
        await registerDocumentUploadIntent({
          legacy_case_id: caseId,
          owner_user_id: user.id,
          entry_channel: "evidence_replacement",
          source_label: `Replacement for document ${documentId}`,
          filename: file.originalname,
          mime_type: file.mimetype,
          byte_size: file.size,
          sha256: sha256Hash,
          planned_storage_object_path: requestedStorageKey,
        });
        intentRegistered = true;

        const storedObject = await storagePut(requestedStorageKey, file.buffer, file.mimetype);
        const s3Key = storedObject.key;
        const s3Url = resolvePersistedDocumentUrl(caseId, storedObject);
        const createdReplacementDocumentId = await dbHelpers.createDocument({
          caseId,
          filename: file.originalname,
          fileType,
          mimeType: file.mimetype,
          fileSize: file.size,
          s3Key,
          s3Url,
          sha256Hash,
          snapshotId,
        });
        replacementDocumentId = createdReplacementDocumentId;

        const receipt = await preserveDocumentInIntakeSpine({
          legacy_case_id: caseId,
          owner_user_id: user.id,
          entry_channel: "evidence_replacement",
          source_label: `Replacement for document ${documentId}`,
          legacy_document_id: createdReplacementDocumentId,
          snapshot_id: snapshotId,
          filename: file.originalname,
          mime_type: file.mimetype,
          byte_size: file.size,
          sha256: sha256Hash,
          storage_key: s3Key,
          replaces_legacy_document_id: documentId,
          replacement_reason: "receipt_backed_intentional_document_replacement",
        });
        replacementDocumentId = undefined;

        await dbHelpers.logAudit({
          caseId,
          userId: user.id,
          action: "replace_document_upload",
          targetType: "document",
          targetId: receipt.legacy_document_id,
          details: {
            originalDocumentId: documentId,
            replacementDocumentId: receipt.legacy_document_id,
            sha256Hash,
            preservationReceiptHash: receipt.receipt_hash,
          },
        }).catch(error => console.error("[Upload] Replacement audit projection failed:", error));

        res.json({
          success: true,
          originalDocumentId: documentId,
          newDocumentId: receipt.legacy_document_id,
          filename: file.originalname,
          sha256Hash,
          receipt,
          message: `Preserved replacement for document #${documentId} ("${originalDoc.filename}")`,
        });
      } catch (error) {
        if (replacementDocumentId && !isIntakeTransactionCommitUncertainError(error)) {
          await removeUnpreservedDocumentProjection(replacementDocumentId, caseId, sha256Hash)
            .catch(cleanupError => console.error("[Upload] Failed replacement projection cleanup:", cleanupError));
        }
        if (intentRegistered) {
          await quarantineDocumentUploadIntent({
            legacy_case_id: caseId,
            owner_user_id: user.id,
            entry_channel: "evidence_replacement",
            source_label: `Replacement for document ${documentId}`,
            sha256: sha256Hash,
            failure_code: uploadFailureCode(error),
            legacy_document_id: replacementDocumentId,
          }).catch(quarantineError => console.error("[Upload] Replacement intent quarantine failed:", quarantineError));
        }
        throw error;
      }
    } catch (err: any) {
      console.error("[Upload] Replace route error:", err);
      res.status(500).json({ error: err.message || "Replacement upload failed" });
    }
  });
}
