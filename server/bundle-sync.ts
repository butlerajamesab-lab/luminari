/**
 * Bundle Sync Endpoint — POST /api/bundle-sync
 *
 * Accepts an offline intake bundle manifest (JSON) + file attachments (multipart),
 * creates a case, preserves declared timeline/entities as import context, and
 * registers uploaded source documents with the Universal Intake Spine.
 *
 * T1. Authenticate user via session cookie
 * T2. Parse multipart form: manifest JSON + file blobs
 * T3. Validate manifest against schema
 * T4. Create case from caseContext
 * T5. Upload each attachment to S3 and register its exact bytes
 * T6. Preserve declared timeline/people as import context in the audit record
 * T7. Generate the domain document checklist
 * T8. Leave governed Intake Spine execution explicit
 * T9. Return case ID + registration summary
 */

import { Express, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { sdk } from "./_core/sdk";
import * as dbHelpers from "./db";
import { storagePut } from "./storage";
import { getChecklistForPipeline } from "./document-checklists";
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

      // T5. Upload attachments and create active source records. The document
      // trigger binds every exact-byte artifact to the case's sole live/upload
      // Intake Spine session; no legacy corpus snapshot is created.
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
          snapshotId: null,
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

      // T6. Manifest timeline and people remain declared import context. They
      // are not injected into legacy projections as if the governed layers had
      // reconstructed them from source evidence.

      // T7. Generate document checklist
      const checklistItems = getChecklistForPipeline(pipelineType);
      if (checklistItems.length > 0) {
        await dbHelpers.createChecklistItems(caseId, checklistItems);
      }

      // T8. The document insert trigger registers each source artifact. The
      // governed Intake Spine remains the sole explicit execution control.

      // Preserve the complete declared context as structured audit data.
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
          declaredTimeline: manifest.timeline,
          declaredPeople: manifest.people,
          hasAdvocate: !!manifest.advocateInfo?.name,
          manifestHash: manifest.manifestHash,
        },
      });

      // T9. Return source-registration summary
      res.json({
        success: true,
        caseId,
        intakeStatus: "evidence_registered",
        summary: {
          caseName: ctx.name,
          domain: domainLabel,
          pipelineType,
          documentsUploaded: uploadedDocs.length,
          documentsRegistered: uploadedDocs.length,
          timelineContextRegistered: manifest.timeline.length,
          peopleContextRegistered: manifest.people.length,
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
