/**
 * Bundle Sync Endpoint — POST /api/bundle-sync
 *
 * Accepts an offline intake bundle manifest (JSON) + file attachments (multipart),
 * creates a case, populates pre-extracted timeline/entities, uploads documents to S3,
 * and enqueues them for the analysis pipeline.
 *
 * T1. Authenticate user via session cookie
 * T2. Parse multipart form: manifest JSON + file blobs
 * T3. Validate manifest against schema
 * T4. Create case from caseContext
 * T5. Create corpus snapshot for the new case
 * T6. Upload each attachment to S3, create document records
 * T7. Pre-populate timeline events from manifest
 * T8. Pre-populate entities from manifest people
 * T9. Auto-generate document checklist for primary pipeline type
 * T10. Enqueue all documents for analysis
 * T11. Log audit trail entry
 * T12. Return case ID + sync summary
 */

import { Express, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { sdk } from "./_core/sdk";
import * as dbHelpers from "./db";
import { storagePut } from "./storage";
import { enqueueDocument } from "./analysis-pipeline";
import { getChecklistForPipeline } from "./document-checklists";
import { ENGINE_VERSION } from "../shared/const";
import {
  BundleManifest,
  validateManifest,
  DOMAIN_TO_PIPELINE,
  DOMAIN_LABELS,
} from "../shared/bundle-manifest";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
});

function classifyFileType(mimeType: string): string {
  if (mimeType.startsWith("application/pdf") || mimeType === "application/msword" || mimeType.includes("wordprocessingml")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

export function registerBundleSyncRoute(app: Express) {
  // Accept up to 20 files (Phase A limit) + the manifest JSON field
  app.post("/api/bundle-sync", upload.array("files", 20), async (req: Request, res: Response) => {
    try {
      // T1. Authenticate
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized — please log in to Luminari first" });
        return;
      }

      // T2. Parse manifest from form field
      const manifestRaw = req.body.manifest;
      if (!manifestRaw) {
        res.status(400).json({ error: "Missing 'manifest' field in request body" });
        return;
      }

      let manifest: BundleManifest;
      try {
        manifest = typeof manifestRaw === "string" ? JSON.parse(manifestRaw) : manifestRaw;
      } catch {
        res.status(400).json({ error: "Invalid JSON in manifest field" });
        return;
      }

      // T3. Validate manifest
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        res.status(400).json({
          error: "Manifest validation failed",
          details: validation.errors,
          warnings: validation.warnings,
        });
        return;
      }

      const files = (req.files as Express.Multer.File[]) || [];
      const ctx = manifest.caseContext;

      // Resolve pipeline type from primary domain
      const pipelineType = DOMAIN_TO_PIPELINE[ctx.primaryDomain] || "other";
      const domainLabel = DOMAIN_LABELS[ctx.primaryDomain] || ctx.primaryDomain;

      // Build case description including additional domains
      let description = ctx.description || ctx.situationNotes || "";
      if (ctx.additionalDomains.length > 0) {
        const additionalLabels = ctx.additionalDomains
          .map(d => DOMAIN_LABELS[d] || d)
          .join(", ");
        description += `\n\nAdditional domains: ${additionalLabels}`;
      }
      if (manifest.advocateInfo?.name) {
        description += `\n\nAdvocate: ${manifest.advocateInfo.name}`;
        if (manifest.advocateInfo.organization) description += ` (${manifest.advocateInfo.organization})`;
      }
      description += `\n\n[Imported from Offline Intake Bundle v${manifest.bundleVersion}]`;

      // T4. Create case
      const caseId = await dbHelpers.createCase(
        user.id,
        ctx.name,
        description.trim(),
        domainLabel,
        undefined, // no container for intake bundles
        pipelineType,
      );

      // T5. Create corpus snapshot
      const snapshotResult = await dbHelpers.createCorpusSnapshot({
        caseId,
        engineVersion: ENGINE_VERSION,
        documentIds: [],
        documentHashes: {},
      });
      const snapshotId = snapshotResult.id;

      // T6. Upload attachments to S3 and create document records
      const uploadedDocs: { docId: number; filename: string; sha256: string }[] = [];
      const attachmentMap = new Map(manifest.attachments.map(a => [a.filename, a]));

      for (const file of files) {
        const sha256 = createHash("sha256").update(file.buffer).digest("hex");
        const suffix = nanoid(8);
        const s3Key = `cases/${caseId}/documents/${sha256.slice(0, 8)}-${suffix}-${file.originalname}`;
        const fileType = classifyFileType(file.mimetype);

        const { url: s3Url } = await storagePut(s3Key, file.buffer, file.mimetype);

        const docId = await dbHelpers.createDocument({
          caseId,
          filename: file.originalname,
          fileType,
          mimeType: file.mimetype,
          fileSize: file.size,
          s3Key,
          s3Url,
          sha256Hash: sha256,
          snapshotId,
        });

        uploadedDocs.push({ docId, filename: file.originalname, sha256 });

        // Check for user notes on this attachment
        const attachmentMeta = attachmentMap.get(file.originalname);
        if (attachmentMeta?.notes) {
          // Store notes as an evidence note linked to this document
          await dbHelpers.logAudit({
            caseId,
            userId: user.id,
            action: "bundle_attachment_note",
            targetType: "document",
            targetId: docId,
            details: { notes: attachmentMeta.notes, bundleAttachmentId: attachmentMeta.id },
          });
        }
      }

      // Update snapshot manifest with uploaded document IDs and hashes
      const docIds = uploadedDocs.map(d => d.docId);
      const docHashes: Record<string, string> = {};
      for (const d of uploadedDocs) {
        docHashes[String(d.docId)] = d.sha256;
      }
      if (docIds.length > 0) {
        await dbHelpers.updateSnapshotManifest(snapshotId, docIds, docHashes);
      }

      // T7. Pre-populate timeline events
      const laneId = `bundle-sync-${caseId}`;
      let eventsCreated = 0;
      for (const entry of manifest.timeline) {
        await dbHelpers.createEvent({
          caseId,
          eventType: "incident", // Default type for bundle-originated events
          title: entry.title,
          description: entry.description,
          dateOccurred: entry.date,
          datePrecision: entry.date.length === 10 ? "exact" : "approximate",
          engineVersion: `bundle-intake-v${manifest.bundleVersion}`,
          laneId,
          snapshotId,
        });
        eventsCreated++;
      }

      // T8. Pre-populate entities from people
      let entitiesCreated = 0;
      for (const person of manifest.people) {
        await dbHelpers.findOrCreateEntity(
          caseId,
          person.name,
          "person",
          `${person.role}: ${person.relationship}${person.contact ? ` (Contact: ${person.contact})` : ""}`,
          `bundle-intake-v${manifest.bundleVersion}`,
          laneId,
          snapshotId,
        );
        entitiesCreated++;
      }

      // T9. Auto-generate document checklist
      const checklistItems = getChecklistForPipeline(pipelineType);
      if (checklistItems.length > 0) {
        await dbHelpers.createChecklistItems(caseId, checklistItems);
      }

      // T10. Enqueue all documents for analysis
      for (const doc of uploadedDocs) {
        enqueueDocument(doc.docId, caseId, snapshotId);
      }

      // T11. Audit trail
      await dbHelpers.logAudit({
        caseId,
        userId: user.id,
        action: "bundle_sync",
        targetType: "case",
        targetId: caseId,
        details: {
          bundleVersion: manifest.bundleVersion,
          userMode: manifest.userMode,
          primaryDomain: ctx.primaryDomain,
          additionalDomains: ctx.additionalDomains,
          documentsUploaded: uploadedDocs.length,
          timelineEntries: manifest.timeline.length,
          peopleEntries: manifest.people.length,
          evidenceNotes: manifest.evidenceNotes.length,
          hasAdvocate: !!manifest.advocateInfo?.name,
          manifestHash: manifest.manifestHash,
        },
      });

      // Log pipeline event
      await dbHelpers.logPipelineEvent(user.id, pipelineType, "intake_complete");

      // T12. Return sync summary
      res.json({
        success: true,
        caseId,
        snapshotId,
        summary: {
          caseName: ctx.name,
          domain: domainLabel,
          pipelineType,
          documentsUploaded: uploadedDocs.length,
          documentsQueued: uploadedDocs.length,
          eventsCreated,
          entitiesCreated,
          checklistItemsGenerated: checklistItems.length,
        },
        warnings: validation.warnings,
      });

    } catch (err: unknown) {
      console.error("[BundleSync] Error:", err);
      const message = err instanceof Error ? err.message : "Unknown error during bundle sync";
      res.status(500).json({ error: message });
    }
  });
}
