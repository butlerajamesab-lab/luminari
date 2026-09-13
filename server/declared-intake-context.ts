import { createHash } from "crypto";
import { nanoid } from "nanoid";
import {
  DECLARED_INTAKE_CONTEXT_CONTRACT_VERSION,
  DECLARED_INTAKE_CONTEXT_MIME_TYPE,
  declared_intake_context_schema,
  declared_intake_submission_schema,
  type declared_intake_context,
  type declared_intake_submission,
} from "@shared/declared-intake-context";
import * as db_helpers from "./db";
import { getPool } from "./db-legacy";
import { storageDelete, storagePut } from "./storage";

async function rollback_failed_declared_intake_document(args: {
  case_id: number;
  user_id: number;
  sha256: string;
  storage_key: string;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      `select document.id
         from public.documents document
         join public.cases owned_case
           on owned_case.id = document.case_id
        where document.case_id = $1::integer
          and owned_case.user_id = $2::integer
          and document.sha256_hash = $3::text
          and document.s3_key = $4::text
        for update of document`,
      [args.case_id, args.user_id, args.sha256, args.storage_key],
    );
    await client.query(
      `delete from public.intake_artifacts artifact
        using public.documents document,
              public.case_intake_links link,
              public.case_identity_bridge bridge
        where artifact.intake_session_id = link.intake_session_id
          and link.case_uuid = bridge.case_uuid
          and bridge.legacy_case_id = $1::integer
          and document.id::text = artifact.metadata ->> 'legacy_document_id'
          and document.case_id = $1::integer
          and document.sha256_hash = $2::text
          and document.s3_key = $3::text
          and artifact.sha256 = $2::text
          and artifact.artifact_status = 'registered'`,
      [args.case_id, args.sha256, args.storage_key],
    );
    await client.query(
      `delete from public.documents document
        using public.cases owned_case
        where document.case_id = owned_case.id
          and document.case_id = $1::integer
          and owned_case.user_id = $2::integer
          and document.sha256_hash = $3::text
          and document.s3_key = $4::text`,
      [args.case_id, args.user_id, args.sha256, args.storage_key],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function build_declared_intake_context(
  submission: declared_intake_submission,
  captured_at = new Date().toISOString(),
): declared_intake_context {
  const parsed = declared_intake_submission_schema.parse(submission);
  return declared_intake_context_schema.parse({
    contract_version: DECLARED_INTAKE_CONTEXT_CONTRACT_VERSION,
    entry_surface: parsed.entry_surface,
    captured_at,
    selection: {
      basis: parsed.selection_basis,
      selected_pipeline: parsed.selected_pipeline,
    },
    declarations: parsed.statements,
    ...(parsed.origin_context ? { origin_context: parsed.origin_context } : {}),
    ...(parsed.language_assistance
      ? { language_assistance: parsed.language_assistance }
      : {}),
  });
}

export async function register_declared_intake_context(args: {
  case_id: number;
  user_id: number;
  submission: declared_intake_submission;
}) {
  const declaration = build_declared_intake_context(args.submission);
  if (
    declaration.origin_context
    && declaration.origin_context.case_id !== args.case_id
  ) {
    throw new Error("declared_intake_context_origin_case_mismatch");
  }

  const body = Buffer.from(JSON.stringify(declaration), "utf8");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const filename = `declared-intake-${Date.now()}-${nanoid(6)}.json`;
  const requested_key = `cases/${args.case_id}/documents/${sha256.slice(0, 8)}-${filename}`;
  let stored: Awaited<ReturnType<typeof storagePut>> | null = null;
  let document_id: number | null = null;
  let intake_session_id: string | null = null;

  try {
    stored = await storagePut(
      requested_key,
      body,
      DECLARED_INTAKE_CONTEXT_MIME_TYPE,
    );

    document_id = await db_helpers.createDocument({
      caseId: args.case_id,
      filename,
      fileType: "text",
      mimeType: DECLARED_INTAKE_CONTEXT_MIME_TYPE,
      fileSize: body.byteLength,
      s3Key: stored.key,
      s3Url: stored.url,
      sha256Hash: sha256,
      snapshotId: null,
    });

    const registration = await getPool().query<{ intake_session_id: string }>(
      `select public.register_declared_intake_context_v1(
         $1::integer,
         $2::integer,
         $3::text,
         $4::text,
         $5::jsonb,
         $6::jsonb
       )::text as intake_session_id`,
      [
        args.case_id,
        document_id,
        sha256,
        declaration.entry_surface,
        JSON.stringify(declaration),
        JSON.stringify({
          ...(args.submission.urgent_situation
            ? { urgent_situation: args.submission.urgent_situation }
            : {}),
          ...(args.submission.origin_context
            ? { origin_context: args.submission.origin_context }
            : {}),
        }),
      ],
    );

    intake_session_id = registration.rows[0]?.intake_session_id ?? null;
    if (!intake_session_id) {
      throw new Error("declared_intake_context_registration_missing_session");
    }
  } catch (registration_error) {
    const cleanup_errors: unknown[] = [];
    if (stored) {
      try {
        await rollback_failed_declared_intake_document({
          case_id: args.case_id,
          user_id: args.user_id,
          sha256,
          storage_key: stored.key,
        });
      } catch (cleanup_error) {
        cleanup_errors.push(cleanup_error);
      }

      if (cleanup_errors.length === 0) {
        try {
          await storageDelete(stored.key);
        } catch (cleanup_error) {
          cleanup_errors.push(cleanup_error);
        }
      }
    }

    if (cleanup_errors.length > 0) {
      throw new AggregateError(
        [registration_error, ...cleanup_errors],
        "declared_intake_context_registration_and_cleanup_failed",
      );
    }
    throw registration_error;
  }

  if (document_id === null || intake_session_id === null) {
    throw new Error("declared_intake_context_registration_incomplete");
  }

  try {
    await db_helpers.logAudit({
      caseId: args.case_id,
      userId: args.user_id,
      action: "declared_intake_context_registered",
      targetType: "document",
      targetId: document_id,
      details: {
        intake_session_id,
        sha256,
        entry_surface: declaration.entry_surface,
        selection_basis: declaration.selection.basis,
        selected_pipeline: declaration.selection.selected_pipeline,
        statement_count: declaration.declarations.length,
        ...(declaration.origin_context
          ? { origin_context: declaration.origin_context }
          : {}),
      },
    });
  } catch (audit_error) {
    console.error("[declared-intake-context] post-registration audit failed", audit_error);
  }

  return {
    document_id,
    intake_session_id,
    sha256,
    declaration,
  };
}
