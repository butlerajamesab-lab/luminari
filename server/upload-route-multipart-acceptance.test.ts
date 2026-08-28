import { createHash } from "node:crypto";
import { request, type Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  select_queue: [] as Array<Array<Record<string, unknown>>>,
  create_context: vi.fn(),
  require_resolved_user: vi.fn(),
  storage_put: vi.fn(),
  storage_delete: vi.fn(),
  storage_get: vi.fn(),
  is_supabase_storage_key: vi.fn(),
  create_upload_session: vi.fn(),
  get_upload_session: vi.fn(),
  increment_upload_session_counter: vi.fn(),
  finalize_upload_session: vi.fn(),
  create_document: vi.fn(),
  log_audit: vi.fn(),
  log_pipeline_event_by_case: vi.fn(),
  check_replacement_eligibility: vi.fn(),
  create_and_supersede_document_atomic: vi.fn(),
  find_committed_document_replacement: vi.fn(),
}));

vi.mock("./_core/context", () => ({
  createContext: state.create_context,
  require_resolved_user: state.require_resolved_user,
}));

vi.mock("./storage", () => ({
  storagePut: state.storage_put,
  storageDelete: state.storage_delete,
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
  },
  createUploadSession: state.create_upload_session,
  getUploadSession: state.get_upload_session,
  incrementUploadSessionCounter: state.increment_upload_session_counter,
  finalizeUploadSession: state.finalize_upload_session,
  createDocument: state.create_document,
  logAudit: state.log_audit,
  logPipelineEventByCase: state.log_pipeline_event_by_case,
  checkReplacementEligibility: state.check_replacement_eligibility,
  createAndSupersedeDocumentAtomic: state.create_and_supersede_document_atomic,
  findCommittedDocumentReplacement: state.find_committed_document_replacement,
}));

import {
  getMultipartUploadCapacitySnapshot,
  registerUploadRoute,
} from "./upload-route";

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

async function post_replacement(contents: string, document_id = 812, filename = "replacement.txt") {
  const form = new FormData();
  form.append("file", new Blob([contents], { type: "text/plain" }), filename);
  return fetch(`${base_url}/api/upload/replace/${document_id}`, {
    method: "POST",
    body: form,
    headers: {
      "x-lighthouse-supabase-session": "test-supabase-session",
    },
  });
}

async function post_unauthenticated_unterminated_multipart(
  path: string,
  field_name: "file" | "files",
) {
  const boundary = "lighthouse-auth-order-proof";
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${field_name}"; filename="proof.txt"`,
    "Content-Type: text/plain",
    "",
    "unauthenticated bytes that must not reach Multer",
  ].join("\r\n");

  return fetch(`${base_url}${path}`, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

async function post_raw_multipart(
  path: string,
  options: { declared_length?: number; send_chunk?: boolean },
) {
  const endpoint = new URL(path, base_url);

  return new Promise<{
    status: number;
    body: Record<string, unknown>;
    retry_after?: string;
  }>((resolve, reject) => {
    const headers: Record<string, string> = {
      connection: "close",
      "content-type": "multipart/form-data; boundary=lighthouse-aggregate-proof",
      "x-lighthouse-supabase-session": "test-supabase-session",
    };
    if (options.declared_length === undefined) {
      headers["transfer-encoding"] = "chunked";
    } else {
      headers["content-length"] = String(options.declared_length);
    }

    const req = request(endpoint, { method: "POST", headers }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
          retry_after: response.headers["retry-after"] as string | undefined,
        });
      });
    });
    req.on("error", reject);
    if (options.send_chunk) req.write("x");
    req.end();
  });
}

function hold_authenticated_multipart_open(path: string) {
  const endpoint = new URL(path, base_url);
  const req = request(endpoint, {
    method: "POST",
    headers: {
      connection: "close",
      "content-type": "multipart/form-data; boundary=lighthouse-capacity-proof",
      "content-length": "1024",
      "x-lighthouse-supabase-session": "test-supabase-session",
    },
  }, response => response.resume());
  req.on("error", () => {});
  req.write([
    "--lighthouse-capacity-proof",
    `Content-Disposition: form-data; name="${path.includes("replace") ? "file" : "files"}"; filename="held.txt"`,
    "Content-Type: text/plain",
    "",
    "held",
  ].join("\r\n"));
  return req;
}

async function post_empty_replacement(document_id = 812) {
  return fetch(`${base_url}/api/upload/replace/${document_id}`, {
    method: "POST",
    body: new FormData(),
    headers: { "x-lighthouse-supabase-session": "test-supabase-session" },
  });
}

function rolled_back_replacement_error(message: string): Error {
  return Object.assign(new Error(message), {
    replacementPersistenceOutcome: "rolled_back",
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
  state.create_upload_session.mockResolvedValue(501);
  state.get_upload_session.mockResolvedValue({ id: 501, caseId: 44, userId: 9 });
  state.increment_upload_session_counter.mockResolvedValue(undefined);
  state.finalize_upload_session.mockResolvedValue(undefined);
  state.create_document.mockResolvedValue(9001);
  state.log_audit.mockResolvedValue(undefined);
  state.log_pipeline_event_by_case.mockResolvedValue(undefined);
  state.storage_put.mockResolvedValue({
    key: "supabase:case-documents/cases/44/proof.txt",
    url: "https://storage.invalid/private-object",
  });
  state.storage_delete.mockResolvedValue(undefined);
  state.storage_get.mockResolvedValue({ url: "https://storage.invalid/signed-object" });
  state.is_supabase_storage_key.mockReturnValue(true);
  state.check_replacement_eligibility.mockResolvedValue({
    eligible: true,
    document: {
      id: 812,
      caseId: 44,
      filename: "original.txt",
      documentResolution: "active",
      snapshotId: null,
    },
  });
  state.create_and_supersede_document_atomic.mockResolvedValue(9002);
  state.find_committed_document_replacement.mockResolvedValue(null);
});

describe("authenticated multipart document upload", () => {
  it.each([
    ["/api/upload", "files"],
    ["/api/upload/replace/812", "file"],
  ] as const)("rejects %s before multipart parsing or buffering", async (path, field_name) => {
    state.require_resolved_user.mockRejectedValue(new Error("missing_session"));

    const response = await post_unauthenticated_unterminated_multipart(path, field_name);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(state.create_context).toHaveBeenCalledTimes(1);
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_document).not.toHaveBeenCalled();
    expect(state.create_upload_session).not.toHaveBeenCalled();
    expect(state.create_and_supersede_document_atomic).not.toHaveBeenCalled();
  });

  it("rejects an oversized aggregate body before Multer", async () => {
    const response = await post_raw_multipart("/api/upload", {
      declared_length: (110 * 1024 * 1024) + 1,
    });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "UPLOAD_REQUEST_TOO_LARGE",
      maxAllowedBytes: 110 * 1024 * 1024,
      receivedBytes: (110 * 1024 * 1024) + 1,
    });
    expect(state.create_context).toHaveBeenCalledTimes(1);
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_upload_session).not.toHaveBeenCalled();
    expect(state.create_and_supersede_document_atomic).not.toHaveBeenCalled();
  });

  it("rejects a chunked multipart upload whose aggregate size is unknowable", async () => {
    const response = await post_raw_multipart("/api/upload", { send_chunk: true });

    expect(response.status).toBe(411);
    expect(response.body).toEqual({
      error: "CONTENT_LENGTH_REQUIRED",
      message: "Multipart uploads require a declared aggregate byte length",
    });
    expect(state.create_context).toHaveBeenCalledTimes(1);
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_upload_session).not.toHaveBeenCalled();
  });

  it("caps concurrent in-memory multipart buffering and asks excess callers to retry", async () => {
    const held_requests = [
      hold_authenticated_multipart_open("/api/upload"),
      hold_authenticated_multipart_open("/api/upload/replace/812"),
    ];

    try {
      await vi.waitFor(() => {
        expect(state.create_context).toHaveBeenCalledTimes(2);
        expect(getMultipartUploadCapacitySnapshot()).toEqual({
          active: 2,
          maximum: 2,
        });
      });

      const response = await post_raw_multipart("/api/upload", { declared_length: 0 });

      expect(response.status).toBe(429);
      expect(response.retry_after).toBe("30");
      expect(response.body).toEqual({
        error: "UPLOAD_CAPACITY_REACHED",
        message: "Upload capacity is temporarily full",
        maxConcurrentUploads: 2,
        retryAfterSeconds: 30,
      });
      expect(state.storage_put).not.toHaveBeenCalled();
      expect(state.create_upload_session).not.toHaveBeenCalled();
    } finally {
      held_requests.forEach(req => req.destroy());
      await vi.waitFor(() => {
        expect(getMultipartUploadCapacitySnapshot().active).toBe(0);
      });
    }

    const released_response = await post_empty_replacement();
    expect(released_response.status).toBe(400);
    expect(await released_response.json()).toEqual({ error: "No file provided" });
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
      snapshotId: null,
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

describe("atomic replacement upload", () => {
  it("rejects immutable originals before writing replacement bytes", async () => {
    state.check_replacement_eligibility.mockResolvedValue({
      eligible: false,
      reason: "[GATE_SEALED_MUTATION] Snapshot v1 (ID: 77) is sealed.",
    });

    const response = await post_replacement("sealed replacement");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "[GATE_SEALED_MUTATION] Snapshot v1 (ID: 77) is sealed.",
    });
    expect(state.storage_put).not.toHaveBeenCalled();
    expect(state.create_and_supersede_document_atomic).not.toHaveBeenCalled();
  });

  it("creates and supersedes through one persistence transaction", async () => {
    const contents = "atomic replacement payload";
    const expected_hash = createHash("sha256").update(contents).digest("hex");
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );

    const response = await post_replacement(contents);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      originalDocumentId: 812,
      newDocumentId: 9002,
      filename: "replacement.txt",
      sha256Hash: expected_hash,
    });
    expect(state.create_and_supersede_document_atomic).toHaveBeenCalledWith(
      812,
      expect.objectContaining({
        caseId: 44,
        filename: "replacement.txt",
        sha256Hash: expected_hash,
        s3Key: "supabase:case-documents/cases/44/proof.txt",
        snapshotId: null,
      }),
      9,
      "Explicit replacement upload registered with the Universal Intake Spine",
    );
    expect(state.storage_delete).not.toHaveBeenCalled();
  });

  it("removes uploaded bytes when the database transaction rolls back", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );
    state.create_and_supersede_document_atomic.mockRejectedValue(
      rolled_back_replacement_error("supersession transaction rejected"),
    );

    const response = await post_replacement("rollback replacement");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "supersession transaction rejected",
    });
    expect(state.storage_delete).toHaveBeenCalledWith(
      "supabase:case-documents/cases/44/proof.txt",
    );
    expect(state.create_document).not.toHaveBeenCalled();
  });

  it("keeps committed evidence when COMMIT acknowledgement is lost", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );
    state.create_and_supersede_document_atomic.mockRejectedValue(
      new Error("connection lost after commit"),
    );
    state.find_committed_document_replacement.mockResolvedValue(9002);

    const response = await post_replacement("committed replacement");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      originalDocumentId: 812,
      newDocumentId: 9002,
    });
    expect(state.find_committed_document_replacement).toHaveBeenCalledWith(
      812,
      44,
      "supabase:case-documents/cases/44/proof.txt",
    );
    expect(state.storage_delete).not.toHaveBeenCalled();
  });

  it("retains evidence when commit reconciliation is unavailable", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );
    state.create_and_supersede_document_atomic.mockRejectedValue(
      new Error("connection lost during commit"),
    );
    state.find_committed_document_replacement.mockRejectedValue(
      new Error("reconciliation database unavailable"),
    );

    const response = await post_replacement("ambiguous replacement");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Replacement commit status could not be verified; uploaded evidence was retained",
    });
    expect(state.storage_delete).not.toHaveBeenCalled();
  });

  it("retains evidence when an ambiguous COMMIT is not visible to the first reconciliation read", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );
    state.create_and_supersede_document_atomic.mockRejectedValue(
      new Error("connection lost while COMMIT was being processed"),
    );
    state.find_committed_document_replacement.mockResolvedValue(null);

    const response = await post_replacement("commit still completing");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Replacement commit status could not be verified; uploaded evidence was retained",
    });
    expect(state.find_committed_document_replacement).toHaveBeenCalledTimes(1);
    expect(state.storage_delete).not.toHaveBeenCalled();
  });

  it("does not start persistence or compensation when storage upload fails", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );
    state.storage_put.mockRejectedValue(new Error("storage upload unavailable"));

    const response = await post_replacement("storage failure replacement");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "storage upload unavailable",
    });
    expect(state.create_and_supersede_document_atomic).not.toHaveBeenCalled();
    expect(state.storage_delete).not.toHaveBeenCalled();
  });

  it("reports a failed compensation instead of silently leaving an orphan", async () => {
    state.select_queue.push(
      [{ id: 44, userId: 9 }],
      [],
    );
    state.create_and_supersede_document_atomic.mockRejectedValue(
      rolled_back_replacement_error("supersession transaction rejected"),
    );
    state.storage_delete.mockRejectedValue(new Error("storage unavailable"));

    const response = await post_replacement("cleanup failure replacement");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Replacement persistence failed and uploaded object cleanup also failed",
    });
    expect(state.storage_delete).toHaveBeenCalledTimes(1);
  });
});
