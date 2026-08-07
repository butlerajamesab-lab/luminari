import { createHash } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  select_queue: [] as Array<Array<Record<string, unknown>>>,
  create_context: vi.fn(),
  require_resolved_user: vi.fn(),
  storage_put: vi.fn(),
  storage_get: vi.fn(),
  is_supabase_storage_key: vi.fn(),
  enqueue_document: vi.fn(),
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
  perform_duplicate_override: vi.fn(),
  check_replacement_eligibility: vi.fn(),
}));

vi.mock("./_core/context", () => ({
  createContext: state.create_context,
  require_resolved_user: state.require_resolved_user,
}));

vi.mock("./storage", () => ({
  storagePut: state.storage_put,
  storageGet: state.storage_get,
  isSupabaseStorageKey: state.is_supabase_storage_key,
}));

vi.mock("./analysis-pipeline", () => ({
  enqueueDocument: state.enqueue_document,
}));

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => state.select_queue.shift() ?? []),
      })),
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
  performDuplicateOverride: state.perform_duplicate_override,
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
    headers: {
      "x-lighthouse-supabase-session": "test-supabase-session",
    },
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
  state.create_context.mockImplementation(async ({ req, res }) => ({
    req,
    res,
    user: null,
    auth: {
      auth_status: "authenticated_profile_resolved",
      supabase_user_id: "test-supabase-user",
      supabase_email: "test@example.invalid",
      profile_resolution_status: "resolved",
      profile_resolution_error: null,
    },
  }));
  state.require_resolved_user.mockResolvedValue({ id: 9 });
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
  state.perform_duplicate_override.mockResolvedValue({ overridden: false });
  state.storage_put.mockResolvedValue({
    key: "supabase:case-documents/cases/44/proof.txt",
    url: "https://storage.invalid/private-object",
  });
  state.storage_get.mockResolvedValue({ url: "https://storage.invalid/signed-object" });
  state.is_supabase_storage_key.mockReturnValue(true);
});

describe("authenticated multipart document upload", () => {
  it("rejects unauthenticated uploads before ownership, storage, or persistence", async () => {
    state.require_resolved_user.mockRejectedValue(new Error("missing_session"));

    const response = await post_file("unauthorized payload");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_document).not.toHaveBeenCalled();
    expect(state.create_upload_session).not.toHaveBeenCalled();
  });

  it("resolves uploads through the current Lighthouse request-auth context", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
      [{ count: 1 }],
    );

    const response = await post_file("current auth payload", "current-auth.txt");

    expect(response.status).toBe(200);
    expect(state.create_context).toHaveBeenCalledTimes(1);
    const contextInput = state.create_context.mock.calls[0]?.[0];
    expect(contextInput.req.headers["x-lighthouse-supabase-session"]).toBe("test-supabase-session");
    expect(state.require_resolved_user).toHaveBeenCalledTimes(1);
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
      }),
    ]);

    expect(state.storage_put).toHaveBeenCalledTimes(1);
    expect(state.storage_put.mock.calls[0]?.[1]).toBeInstanceOf(Buffer);
    expect(state.storage_put.mock.calls[0]?.[1].toString("utf8")).toBe(contents);
    expect(state.storage_put).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^cases/44/documents/${expected_hash.slice(0, 8)}-[A-Za-z0-9_-]{8}-acceptance\\.txt$`)),
      expect.any(Buffer),
      "text/plain",
    );
    expect(state.create_document).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 44,
      filename: "acceptance.txt",
      fileType: "text",
      mimeType: "text/plain",
      fileSize: Buffer.byteLength(contents),
      s3Key: "supabase:case-documents/cases/44/proof.txt",
      s3Url: "/api/cases/44/documents/file?key=supabase%3Acase-documents%2Fcases%2F44%2Fproof.txt",
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
      }),
    }));
    expect(state.log_pipeline_event_by_case).toHaveBeenCalledWith(44, "document_uploaded");
    expect(state.increment_upload_session_counter).toHaveBeenCalledWith(501, "completedFiles");
    expect(state.finalize_upload_session).toHaveBeenCalledWith(501);
  });

  it("replays the same case/hash as a duplicate without storing or inserting a second document", async () => {
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
      }),
    ]);
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_document).not.toHaveBeenCalled();
    expect(state.log_audit).not.toHaveBeenCalled();
    expect(state.increment_upload_session_counter).toHaveBeenCalledWith(501, "duplicateFiles");
    expect(state.finalize_upload_session).toHaveBeenCalledWith(501);
  });
});
