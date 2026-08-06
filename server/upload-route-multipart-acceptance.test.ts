import { createHash } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  select_queue: [] as Array<Array<Record<string, unknown>>>,
  authenticate_request_user: vi.fn(),
  storage_put: vi.fn(),
  storage_get: vi.fn(),
  is_supabase_storage_key: vi.fn(),
  register_upload_intent: vi.fn(),
  quarantine_upload_intent: vi.fn(),
  delete_document_projection: vi.fn(),
  get_open_snapshot: vi.fn(),
  create_corpus_snapshot: vi.fn(),
  get_snapshot: vi.fn(),
  create_upload_session: vi.fn(),
  get_upload_session: vi.fn(),
  increment_upload_session_counter: vi.fn(),
  finalize_upload_session: vi.fn(),
  create_document: vi.fn(),
  log_audit: vi.fn(),
  log_pipeline_event_by_case: vi.fn(),
  check_replacement_eligibility: vi.fn(),
  preserve_document: vi.fn(),
}));

vi.mock("./_core/request-auth", () => ({
  authenticateRequestUser: state.authenticate_request_user,
}));

vi.mock("./intake-spine-runtime", () => ({
  preserveDocumentInIntakeSpine: state.preserve_document,
  registerDocumentUploadIntent: state.register_upload_intent,
  quarantineDocumentUploadIntent: state.quarantine_upload_intent,
  isIntakeTransactionCommitUncertainError: (error: unknown) =>
    Boolean(error && typeof error === "object" &&
      (error as { code?: unknown }).code === "intake_transaction_commit_uncertain"),
}));

vi.mock("./storage", () => ({
  storagePut: state.storage_put,
  storageGet: state.storage_get,
  isSupabaseStorageKey: state.is_supabase_storage_key,
}));

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => state.select_queue.shift() ?? []),
      })),
    })),
    delete: vi.fn(() => ({
      where: state.delete_document_projection,
    })),
  },
  getOpenSnapshot: state.get_open_snapshot,
  createCorpusSnapshot: state.create_corpus_snapshot,
  getSnapshot: state.get_snapshot,
  createUploadSession: state.create_upload_session,
  getUploadSession: state.get_upload_session,
  incrementUploadSessionCounter: state.increment_upload_session_counter,
  finalizeUploadSession: state.finalize_upload_session,
  createDocument: state.create_document,
  logAudit: state.log_audit,
  logPipelineEventByCase: state.log_pipeline_event_by_case,
  checkReplacementEligibility: state.check_replacement_eligibility,
}));

import { registerUploadRoute } from "./upload-route";

let server: Server;
let base_url: string;

async function post_file(contents: string, filename = "proof.txt") {
  const form = new FormData();
  form.set("caseId", "44");
  form.append("files", new Blob([contents], { type: "text/plain" }), filename);
  return fetch(`${base_url}/api/upload`, {
    method: "POST",
    body: form,
    headers: { "x-lighthouse-supabase-session": "test-supabase-session" },
  });
}

beforeAll(async () => {
  const app = express();
  registerUploadRoute(app);
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing_test_server_address");
  base_url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  state.select_queue.length = 0;
  state.authenticate_request_user.mockResolvedValue({ id: 9 });
  state.get_open_snapshot.mockResolvedValue({ id: 77, caseId: 44, status: "open" });
  state.create_corpus_snapshot.mockResolvedValue({ id: 77 });
  state.get_snapshot.mockResolvedValue({ id: 77, caseId: 44, status: "open" });
  state.create_upload_session.mockResolvedValue(501);
  state.get_upload_session.mockResolvedValue({ id: 501, caseId: 44, userId: 9 });
  state.increment_upload_session_counter.mockResolvedValue(undefined);
  state.finalize_upload_session.mockResolvedValue(undefined);
  state.create_document.mockResolvedValue(9001);
  state.log_audit.mockResolvedValue(undefined);
  state.log_pipeline_event_by_case.mockResolvedValue(undefined);
  state.register_upload_intent.mockResolvedValue({ intent_state: "registered" });
  state.quarantine_upload_intent.mockResolvedValue(undefined);
  state.delete_document_projection.mockResolvedValue(undefined);
  state.check_replacement_eligibility.mockResolvedValue({
    eligible: true,
    document: {
      id: 88,
      caseId: 44,
      snapshotId: 77,
      filename: "damaged.txt",
      status: "failed_permanent",
    },
  });
  state.storage_put.mockImplementation(async (key: string) => ({
    key: `supabase://case-documents/${key}`,
    url: "",
  }));
  state.storage_get.mockResolvedValue({ url: "https://storage.invalid/signed-object" });
  state.is_supabase_storage_key.mockReturnValue(true);
  state.preserve_document.mockImplementation(async (input: Record<string, unknown>) => ({
    legacy_case_id: input.legacy_case_id,
    case_uuid: "11111111-1111-5111-8111-111111111111",
    intake_session_id: "22222222-2222-5222-8222-222222222222",
    artifact_id: "33333333-3333-5333-8333-333333333333",
    layer_run_id: "44444444-4444-5444-8444-444444444444",
    verification_record_id: "55555555-5555-5555-8555-555555555555",
    transition_id: "66666666-6666-5666-8666-666666666666",
    legacy_document_id: input.legacy_document_id,
    snapshot_id: input.snapshot_id,
    sha256: input.sha256,
    storage_bucket: "case-documents",
    storage_object_path: "cases/44/documents/by-sha256/test",
    receipt_hash: "a".repeat(64),
    hash_algorithm: "sha256",
    canonicalization_version: "luminari.intake.canonical-json.v2",
    preservation_state: "preserved",
    replayed: false,
  }));
});

describe("authenticated multipart document upload", () => {
  it("rejects unauthenticated uploads before ownership, storage, or persistence", async () => {
    state.authenticate_request_user.mockRejectedValue(new Error("missing_session"));

    const response = await post_file("unauthorized payload");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_document).not.toHaveBeenCalled();
    expect(state.create_upload_session).not.toHaveBeenCalled();
  });

  it("rejects a case not owned by the authenticated user", async () => {
    state.select_queue.push([]);

    const response = await post_file("wrong case payload");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Access denied: you do not own this case",
    });
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_document).not.toHaveBeenCalled();
  });

  it("persists a source-bound file, private access URL, audit receipt, and completed session", async () => {
    const contents = "Lighthouse upload acceptance payload";
    const expected_hash = createHash("sha256").update(contents).digest("hex");
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
      [{ count: 1 }],
    );

    const response = await post_file(contents, "acceptance.txt");
    const body = await response.json() as {
      documents: Array<Record<string, unknown>>;
      sessionId: number;
      summary: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.sessionId).toBe(501);
    expect(body.summary).toMatchObject({
      total: 1,
      uploaded: 1,
      duplicates: 0,
      errors: 0,
      overrides: 0,
      preserved: 1,
      caseDocumentCount: 1,
      caseId: 44,
    });
    expect(body.documents).toEqual([
      expect.objectContaining({
        id: 9001,
        filename: "acceptance.txt",
        fileType: "text",
        sha256Hash: expected_hash,
        status: "uploaded",
        receipt: expect.objectContaining({
          preservation_state: "preserved",
          receipt_hash: "a".repeat(64),
        }),
      }),
    ]);

    expect(state.storage_put).toHaveBeenCalledTimes(1);
    expect(state.storage_put.mock.calls[0]?.[1]).toBeInstanceOf(Buffer);
    expect(state.storage_put.mock.calls[0]?.[1].toString("utf8")).toBe(contents);
    expect(state.storage_put).toHaveBeenCalledWith(
      `cases/44/documents/by-sha256/${expected_hash}`,
      expect.any(Buffer),
      "text/plain",
    );
    expect(state.create_document).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 44,
      filename: "acceptance.txt",
      fileType: "text",
      mimeType: "text/plain",
      fileSize: Buffer.byteLength(contents),
      s3Key: `supabase://case-documents/cases/44/documents/by-sha256/${expected_hash}`,
      s3Url: `/api/cases/44/documents/file?key=${encodeURIComponent(`supabase://case-documents/cases/44/documents/by-sha256/${expected_hash}`)}`,
      sha256Hash: expected_hash,
      snapshotId: 77,
    }));
    expect(state.log_audit).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 44,
      userId: 9,
      action: "upload_document",
      targetType: "document",
      targetId: 9001,
      details: expect.objectContaining({
        filename: "acceptance.txt",
        fileType: "text",
        sha256Hash: expected_hash,
        preservationReceiptHash: "a".repeat(64),
      }),
    }));
    expect(state.authenticate_request_user).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-lighthouse-supabase-session": "test-supabase-session",
        }),
      }),
      expect.anything(),
    );
    expect(state.preserve_document).toHaveBeenCalledWith(expect.objectContaining({
      legacy_case_id: 44,
      owner_user_id: 9,
      legacy_document_id: 9001,
      snapshot_id: 77,
      sha256: expected_hash,
      storage_key: `supabase://case-documents/cases/44/documents/by-sha256/${expected_hash}`,
    }));
    expect(state.register_upload_intent).toHaveBeenCalledWith(expect.objectContaining({
      legacy_case_id: 44,
      owner_user_id: 9,
      sha256: expected_hash,
      planned_storage_object_path: `cases/44/documents/by-sha256/${expected_hash}`,
    }));
    expect(state.log_pipeline_event_by_case).toHaveBeenCalledWith(44, "document_uploaded");
    expect(state.increment_upload_session_counter).toHaveBeenCalledWith(501, "completedFiles");
    expect(state.finalize_upload_session).toHaveBeenCalledWith(501);
  });

  it("replays a duplicate only after proving its content-addressed storage object", async () => {
    const contents = "duplicate acceptance payload";
    const expected_hash = createHash("sha256").update(contents).digest("hex");
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [{
        id: 812,
        caseId: 44,
        filename: "already-preserved.txt",
        status: "uploaded",
        documentResolution: "active",
        sha256Hash: expected_hash,
        mimeType: "text/plain",
        fileSize: 28,
        s3Key: "supabase://case-documents/cases/44/already-preserved.txt",
        snapshotId: 77,
      }],
      [{ count: 1 }],
    );

    const response = await post_file(contents, "duplicate.txt");
    const body = await response.json() as {
      documents: Array<Record<string, unknown>>;
      summary: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      total: 1,
      uploaded: 0,
      duplicates: 1,
      errors: 0,
      overrides: 0,
      preserved: 1,
      caseDocumentCount: 1,
      caseId: 44,
    });
    expect(body.documents).toEqual([
      expect.objectContaining({
        id: 812,
        filename: "duplicate.txt",
        fileType: "text",
        sha256Hash: expected_hash,
        status: "duplicate",
        receipt: expect.objectContaining({ preservation_state: "preserved" }),
      }),
    ]);
    expect(state.storage_put).toHaveBeenCalledWith(
      `cases/44/documents/by-sha256/${expected_hash}`,
      expect.any(Buffer),
      "text/plain",
    );
    expect(state.create_document).not.toHaveBeenCalled();
    expect(state.log_audit).not.toHaveBeenCalled();
    expect(state.preserve_document).toHaveBeenCalledWith(expect.objectContaining({
      legacy_case_id: 44,
      legacy_document_id: 812,
      snapshot_id: 77,
      sha256: expected_hash,
      storage_key: `supabase://case-documents/cases/44/documents/by-sha256/${expected_hash}`,
      allow_legacy_storage_rebind: true,
    }));
    expect(state.increment_upload_session_counter).toHaveBeenCalledWith(501, "duplicateFiles");
    expect(state.finalize_upload_session).toHaveBeenCalledWith(501);
  });

  it("returns a short-lived source URL only after authenticating and scoping the document to its case", async () => {
    state.select_queue.push(
      [{ id: 44 }],
      [{
        id: 812,
        filename: "protected.txt",
        mimeType: "text/plain",
        s3Key: "supabase://case-documents/cases/44/documents/by-sha256/hash",
      }],
    );

    const response = await fetch(
      `${base_url}/api/cases/44/documents/file?key=${encodeURIComponent("supabase://case-documents/cases/44/documents/by-sha256/hash")}&response=json`,
      { headers: { "x-lighthouse-supabase-session": "test-supabase-session" } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://storage.invalid/signed-object",
      filename: "protected.txt",
      expires_in_seconds: 900,
    });
    expect(state.storage_get).toHaveBeenCalledWith(
      "supabase://case-documents/cases/44/documents/by-sha256/hash",
      { download_filename: undefined },
    );
    expect(state.authenticate_request_user).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-lighthouse-supabase-session": "test-supabase-session",
        }),
      }),
      expect.anything(),
    );
  });

  it("preserves an intentional replacement without claiming extraction was queued", async () => {
    const contents = "replacement acceptance payload";
    const expected_hash = createHash("sha256").update(contents).digest("hex");
    state.select_queue.push([{ id: 44, userId: 9 }], []);
    state.create_document.mockResolvedValue(9010);
    state.storage_put.mockResolvedValue({
      key: `supabase://case-documents/cases/44/documents/by-sha256/${expected_hash}`,
      url: "",
    });

    const form = new FormData();
    form.append("file", new Blob([contents], { type: "text/plain" }), "replacement.txt");
    const response = await fetch(`${base_url}/api/upload/replace/88`, {
      method: "POST",
      body: form,
      headers: { "x-lighthouse-supabase-session": "test-supabase-session" },
    });
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      originalDocumentId: 88,
      newDocumentId: 9010,
      receipt: { preservation_state: "preserved", receipt_hash: "a".repeat(64) },
    });
    expect(body.message).not.toMatch(/extract|queue|analy/i);
    expect(state.preserve_document).toHaveBeenCalledWith(expect.objectContaining({
      legacy_case_id: 44,
      owner_user_id: 9,
      legacy_document_id: 9010,
      sha256: expected_hash,
      replaces_legacy_document_id: 88,
      replacement_reason: "receipt_backed_intentional_document_replacement",
    }));
    expect(state.register_upload_intent.mock.invocationCallOrder[0])
      .toBeLessThan(state.storage_put.mock.invocationCallOrder[0]);
    expect(state.storage_put.mock.invocationCallOrder[0])
      .toBeLessThan(state.preserve_document.mock.invocationCallOrder[0]);
  });

  it("refuses to mutate a document projected from a different snapshot", async () => {
    state.check_replacement_eligibility.mockResolvedValue({
      eligible: true,
      document: {
        id: 88,
        caseId: 44,
        snapshotId: 66,
        filename: "sealed-source.txt",
        status: "ready",
      },
    });
    state.select_queue.push([{ id: 44, userId: 9 }]);

    const form = new FormData();
    form.append("file", new Blob(["replacement"], { type: "text/plain" }), "replacement.txt");
    const response = await fetch(`${base_url}/api/upload/replace/88`, {
      method: "POST",
      body: form,
      headers: { "x-lighthouse-supabase-session": "test-supabase-session" },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_SNAPSHOT_NOT_OPEN" });
    expect(state.register_upload_intent).not.toHaveBeenCalled();
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_document).not.toHaveBeenCalled();
  });

  it("quarantines a failed replacement intent and removes its unpreserved legacy projection", async () => {
    const contents = "replacement that cannot be receipted";
    const expected_hash = createHash("sha256").update(contents).digest("hex");
    state.select_queue.push([{ id: 44, userId: 9 }], []);
    state.create_document.mockResolvedValue(9011);
    state.preserve_document.mockRejectedValue(new Error("receipt_insert_rejected"));

    const form = new FormData();
    form.append("file", new Blob([contents], { type: "text/plain" }), "failed-replacement.txt");
    const response = await fetch(`${base_url}/api/upload/replace/88`, {
      method: "POST",
      body: form,
      headers: { "x-lighthouse-supabase-session": "test-supabase-session" },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "receipt_insert_rejected" });
    expect(state.delete_document_projection).toHaveBeenCalledTimes(1);
    expect(state.quarantine_upload_intent).toHaveBeenCalledWith(expect.objectContaining({
      legacy_case_id: 44,
      legacy_document_id: 9011,
      sha256: expected_hash,
      failure_code: "receipt_insert_rejected",
    }));
    expect(state.log_audit).not.toHaveBeenCalled();
  });

  it("retains the document projection when preservation commit status is uncertain", async () => {
    const contents = "replacement with uncertain commit acknowledgement";
    const expected_hash = createHash("sha256").update(contents).digest("hex");
    state.select_queue.push([{ id: 44, userId: 9 }], []);
    state.create_document.mockResolvedValue(9012);
    const uncertain = Object.assign(new Error("intake_transaction_commit_uncertain"), {
      code: "intake_transaction_commit_uncertain",
    });
    state.preserve_document.mockRejectedValue(uncertain);

    const form = new FormData();
    form.append("file", new Blob([contents], { type: "text/plain" }), "uncertain-replacement.txt");
    const response = await fetch(`${base_url}/api/upload/replace/88`, {
      method: "POST",
      body: form,
      headers: { "x-lighthouse-supabase-session": "test-supabase-session" },
    });

    expect(response.status).toBe(500);
    expect(state.delete_document_projection).not.toHaveBeenCalled();
    expect(state.quarantine_upload_intent).toHaveBeenCalledWith(expect.objectContaining({
      legacy_case_id: 44,
      legacy_document_id: 9012,
      sha256: expected_hash,
    }));
  });
});
