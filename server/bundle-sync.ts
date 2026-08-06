/**
 * Offline bundle intake boundary — POST /api/bundle-sync
 *
 * The offline manifest remains a compatibility input. Every attached source
 * document crosses the same deterministic Universal Intake Spine used by the
 * Lighthouse upload surface:
 *
 *   validate bytes -> register intent -> content-addressed storage ->
 *   legacy document projection -> immutable preservation receipt
 *
 * Timeline, entity, checklist, and audit writes are compatibility projections.
 * They do not claim document analysis, extraction, or verification.
 */

import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { documents } from "../drizzle/schema";
import { ENGINE_VERSION } from "../shared/const";
import {
  type BundleAttachment,
  type BundleManifest,
  DOMAIN_LABELS,
  DOMAIN_TO_PIPELINE,
  validateManifest,
} from "../shared/bundle-manifest";
import { authenticateRequestUser } from "./_core/request-auth";
import * as dbHelpers from "./db";
import { db } from "./db";
import { getChecklistForPipeline } from "./document-checklists";
import {
  createCaseWithIntakeSpine,
  isIntakeTransactionCommitUncertainError,
  preserveDocumentInIntakeSpine,
  quarantineDocumentUploadIntent,
  registerDocumentUploadIntent,
} from "./intake-spine-runtime";
import { isSupabaseStorageKey, storagePut } from "./storage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

type PreparedBundleFile = {
  file: Express.Multer.File;
  attachment: BundleAttachment;
  sha256: string;
};

type BundleDocumentFailure = {
  filename: string;
  sha256: string;
  legacy_document_id: number | null;
  failure_code: string;
  commit_state: "rejected" | "uncertain";
};

type AuthenticatedBundleUser = Awaited<
  ReturnType<typeof authenticateRequestUser>
>;

async function authenticate_bundle_request(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.locals.bundle_sync_user = await authenticateRequestUser(req, res);
    next();
  } catch {
    res.status(401).json({
      error: "Unauthorized — please log in to Luminari first",
    });
  }
}

function classifyFileType(mime_type: string): string {
  if (
    mime_type.startsWith("application/pdf") ||
    mime_type === "application/msword" ||
    mime_type.includes("wordprocessingml")
  )
    return "pdf";
  if (mime_type.startsWith("image/")) return "image";
  if (mime_type.startsWith("video/")) return "video";
  if (mime_type.startsWith("audio/")) return "audio";
  if (mime_type.startsWith("text/")) return "text";
  return "other";
}

function failure_code(error: unknown): string {
  if (error instanceof Error && error.message)
    return error.message.slice(0, 256);
  return "bundle_document_preservation_failed";
}

function build_document_access_url(
  case_id: number,
  storage_key: string,
): string {
  const query = new URLSearchParams({ key: storage_key });
  return `/api/cases/${case_id}/documents/file?${query.toString()}`;
}

function persisted_document_url(
  case_id: number,
  stored_object: { key: string; url: string },
): string {
  return isSupabaseStorageKey(stored_object.key)
    ? build_document_access_url(case_id, stored_object.key)
    : stored_object.url;
}

function prepare_bundle_files(
  files: Express.Multer.File[],
  attachments: BundleAttachment[],
): PreparedBundleFile[] {
  const unmatched = attachments.map((attachment, index) => ({
    attachment,
    index,
  }));
  const prepared = files.map((file) => {
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const matching_index = unmatched.findIndex(
      ({ attachment }) =>
        attachment.filename === file.originalname &&
        /^[0-9a-f]{64}$/i.test(attachment.sha256) &&
        attachment.sha256.toLowerCase() === sha256,
    );
    if (matching_index < 0) {
      const filename_registered = unmatched.some(
        ({ attachment }) => attachment.filename === file.originalname,
      );
      throw new Error(
        filename_registered
          ? `bundle_attachment_sha256_mismatch:${file.originalname}`
          : `bundle_attachment_not_registered:${file.originalname}`,
      );
    }

    const [{ attachment }] = unmatched.splice(matching_index, 1);
    if (!Number.isInteger(attachment.size) || attachment.size !== file.size) {
      throw new Error(
        `bundle_attachment_byte_size_mismatch:${file.originalname}`,
      );
    }
    if (attachment.mimeType && attachment.mimeType !== file.mimetype) {
      throw new Error(
        `bundle_attachment_mime_type_mismatch:${file.originalname}`,
      );
    }

    return {
      file,
      attachment,
      sha256,
    };
  });

  if (unmatched.length > 0) {
    throw new Error(
      `bundle_attachment_file_missing:${unmatched[0].attachment.filename}`,
    );
  }
  return prepared;
}

async function remove_unpreserved_document_projection(
  document_id: number,
  case_id: number,
  sha256: string,
): Promise<void> {
  await db
    .delete(documents)
    .where(
      and(
        eq(documents.id, document_id),
        eq(documents.caseId, case_id),
        eq(documents.sha256Hash, sha256),
      ),
    );
}

export function registerBundleSyncRoute(app: Express): void {
  app.post(
    "/api/bundle-sync",
    authenticate_bundle_request,
    upload.array("files", 20),
    async (req: Request, res: Response) => {
      try {
        const user = res.locals.bundle_sync_user as AuthenticatedBundleUser;

        const manifest_raw = req.body.manifest;
        if (!manifest_raw) {
          res
            .status(400)
            .json({ error: "Missing 'manifest' field in request body" });
          return;
        }

        let manifest: BundleManifest;
        try {
          manifest =
            typeof manifest_raw === "string"
              ? (JSON.parse(manifest_raw) as BundleManifest)
              : (manifest_raw as BundleManifest);
        } catch {
          res.status(400).json({ error: "Invalid JSON in manifest field" });
          return;
        }

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
        let prepared_files: PreparedBundleFile[];
        try {
          // Hash and reconcile every byte stream before creating durable case
          // state. The final case-specific path is assigned after case creation.
          prepared_files = prepare_bundle_files(files, manifest.attachments);
        } catch (error) {
          res.status(400).json({ error: failure_code(error) });
          return;
        }

        const context = manifest.caseContext;
        const pipeline_type =
          DOMAIN_TO_PIPELINE[context.primaryDomain] || "other";
        const domain_label =
          DOMAIN_LABELS[context.primaryDomain] || context.primaryDomain;

        let description = context.description || context.situationNotes || "";
        if (context.additionalDomains.length > 0) {
          const additional_labels = context.additionalDomains
            .map((domain) => DOMAIN_LABELS[domain] || domain)
            .join(", ");
          description += `\n\nAdditional domains: ${additional_labels}`;
        }
        if (manifest.advocateInfo?.name) {
          description += `\n\nAdvocate: ${manifest.advocateInfo.name}`;
          if (manifest.advocateInfo.organization) {
            description += ` (${manifest.advocateInfo.organization})`;
          }
        }
        description += `\n\n[Imported from Offline Intake Bundle v${manifest.bundleVersion}]`;

        const spine = await createCaseWithIntakeSpine({
          owner_user_id: user.id,
          name: context.name,
          description: description.trim(),
          domain: domain_label,
          pipeline_type,
          entry_channel: "offline_bundle_sync",
        });
        const case_id = spine.id;

        let snapshot = await dbHelpers.getOpenSnapshot(case_id);
        if (!snapshot) {
          const created_snapshot = await dbHelpers.createCorpusSnapshot({
            caseId: case_id,
            engineVersion: ENGINE_VERSION,
            documentIds: [],
            documentHashes: {},
          });
          snapshot = await dbHelpers.getSnapshot(created_snapshot.id);
        }
        if (!snapshot || snapshot.status !== "open") {
          throw new Error("bundle_open_snapshot_not_available");
        }
        const snapshot_id = snapshot.id;

        const documents_preserved: Array<{
          docId: number;
          filename: string;
          sha256: string;
          receipt: Awaited<ReturnType<typeof preserveDocumentInIntakeSpine>>;
        }> = [];
        const document_failures: BundleDocumentFailure[] = [];
        const projection_warnings: string[] = [];

        for (const prepared of prepared_files) {
          const { file, attachment, sha256 } = prepared;
          const storage_object_path = `cases/${case_id}/documents/by-sha256/${sha256}`;
          let intent_registered = false;
          let unpreserved_document_id: number | undefined;

          try {
            await registerDocumentUploadIntent({
              legacy_case_id: case_id,
              owner_user_id: user.id,
              entry_channel: "offline_bundle_sync",
              source_label: context.name,
              filename: file.originalname,
              mime_type: file.mimetype,
              byte_size: file.size,
              sha256,
              planned_storage_object_path: storage_object_path,
            });
            intent_registered = true;

            const stored_object = await storagePut(
              storage_object_path,
              file.buffer,
              file.mimetype,
            );
            const document_id = await dbHelpers.createDocument({
              caseId: case_id,
              filename: file.originalname,
              fileType: classifyFileType(file.mimetype),
              mimeType: file.mimetype,
              fileSize: file.size,
              s3Key: stored_object.key,
              s3Url: persisted_document_url(case_id, stored_object),
              sha256Hash: sha256,
              snapshotId: snapshot_id,
            });
            unpreserved_document_id = document_id;

            const receipt = await preserveDocumentInIntakeSpine({
              legacy_case_id: case_id,
              owner_user_id: user.id,
              entry_channel: "offline_bundle_sync",
              source_label: context.name,
              legacy_document_id: document_id,
              snapshot_id,
              filename: file.originalname,
              mime_type: file.mimetype,
              byte_size: file.size,
              sha256,
              storage_key: stored_object.key,
            });
            if (receipt.preservation_state !== "preserved") {
              throw new Error("bundle_preservation_receipt_not_preserved");
            }
            unpreserved_document_id = undefined;
            documents_preserved.push({
              docId: document_id,
              filename: file.originalname,
              sha256,
              receipt,
            });

            if (attachment.notes) {
              await dbHelpers
                .logAudit({
                  caseId: case_id,
                  userId: user.id,
                  action: "bundle_attachment_note",
                  targetType: "document",
                  targetId: document_id,
                  details: {
                    notes: attachment.notes,
                    bundleAttachmentId: attachment.id,
                    preservationReceiptHash: receipt.receipt_hash,
                  },
                })
                .catch((error) => {
                  projection_warnings.push(
                    `bundle_attachment_note_projection_failed:${failure_code(error)}`,
                  );
                });
            }
          } catch (error) {
            const commit_uncertain =
              isIntakeTransactionCommitUncertainError(error);
            const failed_document_id = unpreserved_document_id;
            if (failed_document_id && !commit_uncertain) {
              await remove_unpreserved_document_projection(
                failed_document_id,
                case_id,
                sha256,
              ).catch((cleanup_error) => {
                projection_warnings.push(
                  `bundle_document_cleanup_failed:${failure_code(cleanup_error)}`,
                );
              });
            }
            if (intent_registered) {
              await quarantineDocumentUploadIntent({
                legacy_case_id: case_id,
                owner_user_id: user.id,
                entry_channel: "offline_bundle_sync",
                source_label: context.name,
                sha256,
                failure_code: failure_code(error),
                legacy_document_id: failed_document_id,
              }).catch((quarantine_error) => {
                projection_warnings.push(
                  `bundle_intent_quarantine_failed:${failure_code(quarantine_error)}`,
                );
              });
            }
            document_failures.push({
              filename: file.originalname,
              sha256,
              legacy_document_id: failed_document_id ?? null,
              failure_code: failure_code(error),
              commit_state: commit_uncertain ? "uncertain" : "rejected",
            });
          }
        }

        const lane_id = `bundle-sync-${case_id}`;
        let events_created = 0;
        for (const entry of manifest.timeline) {
          try {
            await dbHelpers.createEvent({
              caseId: case_id,
              eventType: "incident",
              title: entry.title,
              description: entry.description,
              dateOccurred: entry.date,
              datePrecision: entry.date.length === 10 ? "exact" : "approximate",
              engineVersion: `bundle-intake-v${manifest.bundleVersion}`,
              laneId: lane_id,
              snapshotId: snapshot_id,
            });
            events_created += 1;
          } catch (error) {
            projection_warnings.push(
              `bundle_timeline_projection_failed:${failure_code(error)}`,
            );
          }
        }

        let entities_created = 0;
        for (const person of manifest.people) {
          try {
            await dbHelpers.findOrCreateEntity(
              case_id,
              person.name,
              "person",
              `${person.role}: ${person.relationship}${
                person.contact ? ` (Contact: ${person.contact})` : ""
              }`,
              `bundle-intake-v${manifest.bundleVersion}`,
              lane_id,
              snapshot_id,
            );
            entities_created += 1;
          } catch (error) {
            projection_warnings.push(
              `bundle_entity_projection_failed:${failure_code(error)}`,
            );
          }
        }

        const checklist_items = getChecklistForPipeline(pipeline_type);
        let checklist_items_generated = 0;
        if (checklist_items.length > 0) {
          try {
            await dbHelpers.createChecklistItems(case_id, checklist_items);
            checklist_items_generated = checklist_items.length;
          } catch (error) {
            projection_warnings.push(
              `bundle_checklist_projection_failed:${failure_code(error)}`,
            );
          }
        }

        await dbHelpers
          .logAudit({
            caseId: case_id,
            userId: user.id,
            action: "bundle_sync",
            targetType: "case",
            targetId: case_id,
            details: {
              bundleVersion: manifest.bundleVersion,
              userMode: manifest.userMode,
              primaryDomain: context.primaryDomain,
              additionalDomains: context.additionalDomains,
              documentsPreserved: documents_preserved.length,
              documentFailures: document_failures,
              preservationReceiptHashes: documents_preserved.map(
                (document) => document.receipt.receipt_hash,
              ),
              timelineEntries: manifest.timeline.length,
              peopleEntries: manifest.people.length,
              evidenceNotes: manifest.evidenceNotes.length,
              hasAdvocate: !!manifest.advocateInfo?.name,
              manifestHash: manifest.manifestHash,
            },
          })
          .catch((error) => {
            projection_warnings.push(
              `bundle_audit_projection_failed:${failure_code(error)}`,
            );
          });

        res.json({
          success: true,
          completion_state:
            document_failures.length === 0 ? "preserved" : "partial",
          caseId: case_id,
          snapshotId: snapshot_id,
          case_uuid: spine.case_uuid,
          intake_session_id: spine.intake_session_id,
          documents: documents_preserved,
          document_failures,
          summary: {
            caseName: context.name,
            domain: domain_label,
            pipelineType: pipeline_type,
            documentsUploaded: documents_preserved.length,
            documentsPreserved: documents_preserved.length,
            documentFailures: document_failures.length,
            eventsCreated: events_created,
            entitiesCreated: entities_created,
            checklistItemsGenerated: checklist_items_generated,
          },
          warnings: [...validation.warnings, ...projection_warnings],
        });
      } catch (error) {
        console.error("[BundleSync] Error:", error);
        res.status(500).json({ error: failure_code(error) });
      }
    },
  );
}
