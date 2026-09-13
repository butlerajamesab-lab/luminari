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
import { storagePut } from "./storage";

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
  const stored = await storagePut(
    requested_key,
    body,
    DECLARED_INTAKE_CONTEXT_MIME_TYPE,
  );

  const document_id = await db_helpers.createDocument({
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

  const intake_session_id = registration.rows[0]?.intake_session_id;
  if (!intake_session_id) {
    throw new Error("declared_intake_context_registration_missing_session");
  }

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

  return {
    document_id,
    intake_session_id,
    sha256,
    declaration,
  };
}
