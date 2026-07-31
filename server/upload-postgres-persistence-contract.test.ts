import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  auditTrail,
  corpusSnapshots,
  documents,
  pipelineEvents,
  uploadSessions,
} from "../drizzle/schema";

function read_source(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

const db_source = read_source("./db.ts");

function function_source(name: string, next_name: string): string {
  const start = db_source.indexOf(`export async function ${name}`);
  const end = db_source.indexOf(`export async function ${next_name}`, start + 1);

  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${next_name} must follow ${name}`).toBeGreaterThan(start);
  return db_source.slice(start, end);
}

function physical_column_names(
  columns: Record<string, { name: string }>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(columns).map(([property_name, column]) => [
      property_name,
      column.name,
    ]),
  );
}

describe("document upload PostgreSQL persistence contract", () => {
  it("maps corpus_snapshots to the verified Lighthouse columns", () => {
    const columns = getTableColumns(corpusSnapshots);

    expect(physical_column_names(columns)).toEqual({
      id: "id",
      caseId: "case_id",
      version: "version",
      engineVersion: "engine_version",
      documentIds: "document_ids",
      documentHashes: "document_hashes",
      createdAt: "created_at",
      sealedAt: "sealed_at",
      status: "snapshot_status",
      signature: "signature",
      signatureAlgorithm: "signature_algorithm",
      publicKeyFingerprint: "public_key_fingerprint",
    });

    expect(columns.id.getSQLType()).toBe("serial");
    expect(columns.documentIds.getSQLType()).toBe("text");
    expect(columns.documentIds.mapToDriverValue([11, 12])).toBe("[11,12]");
    expect(columns.documentIds.mapFromDriverValue("[11,12]")).toEqual([11, 12]);
    expect(columns.documentHashes.mapToDriverValue({ 11: "abc" })).toBe(
      '{"11":"abc"}',
    );
  });

  it("maps upload_sessions to snake_case PostgreSQL columns", () => {
    const columns = getTableColumns(uploadSessions);

    expect(physical_column_names(columns)).toEqual({
      id: "id",
      caseId: "case_id",
      userId: "user_id",
      totalFiles: "total_files",
      completedFiles: "completed_files",
      failedFiles: "failed_files",
      duplicateFiles: "duplicate_files",
      status: "session_status",
      createdAt: "created_at",
      updatedAt: "updated_at",
    });
    expect(columns.id.getSQLType()).toBe("serial");
  });

  it("maps documents to the integer-id legacy Lighthouse contract", () => {
    const columns = getTableColumns(documents);

    expect(physical_column_names(columns)).toEqual({
      id: "id",
      caseId: "case_id",
      filename: "filename",
      fileType: "file_type",
      mimeType: "mime_type",
      fileSize: "file_size",
      s3Key: "s3_key",
      s3Url: "s3_url",
      sha256Hash: "sha256_hash",
      status: "status",
      errorMessage: "error_message",
      retryCount: "retry_count",
      textContent: "text_content",
      pageCount: "page_count",
      durationSeconds: "duration_seconds",
      documentType: "document_type",
      documentPurpose: "document_purpose",
      aiMetadata: "ai_metadata",
      createdAt: "created_at",
      snapshotId: "snapshot_id",
      documentResolution: "document_resolution",
      replacedByDocumentId: "replaced_by_document_id",
      resolutionReason: "resolution_reason",
    });

    expect(columns.id.getSQLType()).toBe("serial");
    expect(columns.caseId.getSQLType()).toBe("integer");
    expect(columns.snapshotId.getSQLType()).toBe("integer");
  });

  it("maps upload audit and pipeline receipts to their live snake_case tables", () => {
    const audit_columns = getTableColumns(auditTrail);
    const pipeline_columns = getTableColumns(pipelineEvents);

    expect(physical_column_names(audit_columns)).toEqual({
      id: "id",
      caseId: "case_id",
      userId: "user_id",
      action: "action",
      targetType: "target_type",
      targetId: "target_id",
      details: "details",
      hash: "hash",
      createdAt: "created_at",
    });
    expect(audit_columns.details.getSQLType()).toBe("text");
    expect(audit_columns.details.mapToDriverValue({ source: "upload" })).toBe(
      '{"source":"upload"}',
    );

    expect(physical_column_names(pipeline_columns)).toEqual({
      id: "id",
      userId: "user_id",
      pipelineType: "pipeline_type",
      eventType: "event_type",
      stateCode: "state_code",
      createdAt: "created_at",
    });
    expect(pipeline_columns.eventType.getSQLType()).toBe("text");
  });

  it("registers the upload route before the production static fallback", () => {
    const entrypoint_source = read_source("./_core/index.ts");
    const import_index = entrypoint_source.indexOf(
      'import { registerUploadRoute } from "../upload-route";',
    );
    const registration_index = entrypoint_source.indexOf(
      "registerUploadRoute(app);",
    );
    const static_fallback_index = entrypoint_source.indexOf(
      "else serveStatic(app);",
    );

    expect(import_index).toBeGreaterThanOrEqual(0);
    expect(registration_index).toBeGreaterThan(import_index);
    expect(static_fallback_index).toBeGreaterThan(registration_index);
  });

  it("uses PostgreSQL RETURNING for every upload-path identity", () => {
    const snapshot_insert = function_source(
      "createCorpusSnapshot",
      "getOpenSnapshot",
    );
    const document_insert = function_source("createDocument", "listDocuments");
    const session_insert = function_source(
      "createUploadSession",
      "getUploadSession",
    );

    expect(snapshot_insert).toContain(
      ".returning({ id: corpusSnapshots.id })",
    );
    expect(document_insert).toContain(".returning({ id: documents.id })");
    expect(session_insert).toContain(
      ".returning({ id: uploadSessions.id })",
    );

    for (const source of [snapshot_insert, document_insert, session_insert]) {
      expect(source).not.toContain("$returningId");
      expect(source).not.toContain("insertId");
    }

    expect(document_insert).toContain('status: "uploaded"');
    expect(document_insert).toContain('documentResolution: "active"');
  });

  it("uses integer case ids when filtering the live documents table", () => {
    for (const source of [
      read_source("./analysis-pipeline.ts"),
      read_source("./routers/assembly-engine.ts"),
      read_source("./routers/case-repair.ts"),
      read_source("./services/form-extraction-service.ts"),
    ]) {
      expect(source).not.toContain("eq(documents.caseId, String(");
    }
  });
});
