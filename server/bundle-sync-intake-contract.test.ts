import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import express from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const CASE_UUID = "11111111-1111-5111-8111-111111111111";
const SESSION_UUID = "22222222-2222-5222-8222-222222222222";
const RECEIPT_HASH = "a".repeat(64);

const state = vi.hoisted(() => ({
  operations: [] as string[],
  authenticate_request_user: vi.fn(),
  create_case_with_spine: vi.fn(),
  get_open_snapshot: vi.fn(),
  create_corpus_snapshot: vi.fn(),
  get_snapshot: vi.fn(),
  register_upload_intent: vi.fn(),
  storage_put: vi.fn(),
  is_supabase_storage_key: vi.fn(),
  create_document: vi.fn(),
  preserve_document: vi.fn(),
  quarantine_upload_intent: vi.fn(),
  delete_document_projection: vi.fn(),
  create_event: vi.fn(),
  find_or_create_entity: vi.fn(),
  create_checklist_items: vi.fn(),
  get_checklist_for_pipeline: vi.fn(),
  log_audit: vi.fn(),
}));

vi.mock("./_core/request-auth", () => ({
  authenticateRequestUser: state.authenticate_request_user,
}));

vi.mock("./intake-spine-runtime", () => ({
  createCaseWithIntakeSpine: state.create_case_with_spine,
  registerDocumentUploadIntent: state.register_upload_intent,
  preserveDocumentInIntakeSpine: state.preserve_document,
  quarantineDocumentUploadIntent: state.quarantine_upload_intent,
  isIntakeTransactionCommitUncertainError: (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "intake_transaction_commit_uncertain",
    ),
}));

vi.mock("./storage", () => ({
  storagePut: state.storage_put,
  isSupabaseStorageKey: state.is_supabase_storage_key,
}));

vi.mock("./document-checklists", () => ({
  getChecklistForPipeline: state.get_checklist_for_pipeline,
}));

vi.mock("./db", () => ({
  db: {
    delete: vi.fn(() => ({ where: state.delete_document_projection })),
  },
  getOpenSnapshot: state.get_open_snapshot,
  createCorpusSnapshot: state.create_corpus_snapshot,
  getSnapshot: state.get_snapshot,
  createDocument: state.create_document,
  createEvent: state.create_event,
  findOrCreateEntity: state.find_or_create_entity,
  createChecklistItems: state.create_checklist_items,
  logAudit: state.log_audit,
}));

import { registerBundleSyncRoute } from "./bundle-sync";

let server: Server;
let base_url: string;

function manifest_for(contents: string, sha256_override?: string) {
  const sha256 =
    sha256_override ?? createHash("sha256").update(contents).digest("hex");
  return {
    bundleVersion: "1.0.0",
    createdAt: 1,
    updatedAt: 1,
    manifestHash: "bundle-hash-test",
    userMode: "independent",
    syncMode: "manual",
    caseContext: {
      name: "Offline housing record",
      description: "A bounded offline intake fixture.",
      primaryDomain: "housing",
      additionalDomains: [],
      situationNotes: "",
    },
    timeline: [],
    people: [],
    attachments: [
      {
        id: "attachment-1",
        filename: "proof.txt",
        mimeType: "text/plain",
        size: Buffer.byteLength(contents),
        sha256,
        capturedAt: 1,
        notes: "Preserve the original bytes.",
      },
    ],
    evidenceNotes: [],
  };
}

async function post_bundle(
  contents: string,
  manifest = manifest_for(contents),
) {
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  form.append(
    "files",
    new Blob([contents], { type: "text/plain" }),
    "proof.txt",
  );
  return fetch(`${base_url}/api/bundle-sync`, {
    method: "POST",
    body: form,
    headers: { "x-lighthouse-supabase-session": "test-session" },
  });
}

beforeAll(async () => {
  const app = express();
  registerBundleSyncRoute(app);
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("missing_bundle_sync_test_address");
  }
  base_url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  state.operations.length = 0;
  state.authenticate_request_user.mockImplementation(async () => {
    state.operations.push("authenticate");
    return { id: 9 };
  });
  state.create_case_with_spine.mockImplementation(async () => {
    state.operations.push("create_case_with_spine");
    return {
      id: 44,
      legacy_case_id: 44,
      case_uuid: CASE_UUID,
      intake_session_id: SESSION_UUID,
    };
  });
  state.get_open_snapshot.mockImplementation(async () => {
    state.operations.push("get_open_snapshot");
    return null;
  });
  state.create_corpus_snapshot.mockImplementation(async () => {
    state.operations.push("create_snapshot");
    return { id: 77 };
  });
  state.get_snapshot.mockImplementation(async () => {
    state.operations.push("get_snapshot");
    return { id: 77, status: "open", caseId: 44 };
  });
  state.register_upload_intent.mockImplementation(async () => {
    state.operations.push("intent");
    return { intent_state: "registered" };
  });
  state.storage_put.mockImplementation(async (path: string) => {
    state.operations.push("storage");
    return {
      key: `supabase://case-documents/${path}`,
      url: "",
    };
  });
  state.is_supabase_storage_key.mockReturnValue(true);
  state.create_document.mockImplementation(async () => {
    state.operations.push("document");
    return 9001;
  });
  state.preserve_document.mockImplementation(
    async (input: Record<string, unknown>) => {
      state.operations.push("preserve");
      return {
        legacy_case_id: input.legacy_case_id,
        case_uuid: CASE_UUID,
        intake_session_id: SESSION_UUID,
        artifact_id: "33333333-3333-5333-8333-333333333333",
        layer_run_id: "44444444-4444-5444-8444-444444444444",
        verification_record_id: "55555555-5555-5555-8555-555555555555",
        transition_id: "66666666-6666-5666-8666-666666666666",
        legacy_document_id: input.legacy_document_id,
        snapshot_id: input.snapshot_id,
        sha256: input.sha256,
        storage_bucket: "case-documents",
        storage_object_path: String(input.storage_key).replace(
          "supabase://case-documents/",
          "",
        ),
        input_hash: "b".repeat(64),
        output_hash: "c".repeat(64),
        receipt_hash: RECEIPT_HASH,
        previous_receipt_hash: null,
        hash_algorithm: "sha256",
        canonicalization_version: "luminari.intake.canonical-json.v2",
        preservation_state: "preserved",
        verification_scope: "request_bytes_and_storage_addressability",
        replayed: false,
      };
    },
  );
  state.quarantine_upload_intent.mockImplementation(async () => {
    state.operations.push("quarantine");
  });
  state.delete_document_projection.mockImplementation(async () => {
    state.operations.push("delete_document");
  });
  state.create_event.mockResolvedValue(undefined);
  state.find_or_create_entity.mockResolvedValue(undefined);
  state.create_checklist_items.mockResolvedValue(undefined);
  state.get_checklist_for_pipeline.mockReturnValue([]);
  state.log_audit.mockImplementation(async () => {
    state.operations.push("audit");
  });
});

describe("offline bundle Universal Intake Spine boundary", () => {
  it("preserves every file through intent, content-addressed storage, document, and receipt", async () => {
    const contents = "offline bundle receipt fixture";
    const sha256 = createHash("sha256").update(contents).digest("hex");

    const response = await post_bundle(contents);
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      completion_state: "preserved",
      caseId: 44,
      snapshotId: 77,
      case_uuid: CASE_UUID,
      intake_session_id: SESSION_UUID,
      document_failures: [],
      summary: {
        documentsUploaded: 1,
        documentsPreserved: 1,
        documentFailures: 0,
      },
    });
    expect(body.documents).toEqual([
      expect.objectContaining({
        docId: 9001,
        filename: "proof.txt",
        sha256,
        receipt: expect.objectContaining({
          receipt_hash: RECEIPT_HASH,
          preservation_state: "preserved",
        }),
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("documentsQueued");

    expect(state.operations).toContain("create_case_with_spine");
    expect(state.operations.indexOf("storage")).toBeGreaterThan(
      state.operations.indexOf("intent"),
    );
    expect(state.operations.indexOf("document")).toBeGreaterThan(
      state.operations.indexOf("storage"),
    );
    expect(state.operations.indexOf("preserve")).toBeGreaterThan(
      state.operations.indexOf("document"),
    );
    expect(state.register_upload_intent).toHaveBeenCalledWith(
      expect.objectContaining({
        sha256,
        planned_storage_object_path: `cases/44/documents/by-sha256/${sha256}`,
      }),
    );
    expect(state.storage_put).toHaveBeenCalledWith(
      `cases/44/documents/by-sha256/${sha256}`,
      expect.any(Buffer),
      "text/plain",
    );
    expect(state.create_document).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 44,
        snapshotId: 77,
        sha256Hash: sha256,
        s3Key: `supabase://case-documents/cases/44/documents/by-sha256/${sha256}`,
      }),
    );
    expect(state.preserve_document).toHaveBeenCalledWith(
      expect.objectContaining({
        legacy_case_id: 44,
        legacy_document_id: 9001,
        snapshot_id: 77,
        sha256,
        storage_key: `supabase://case-documents/cases/44/documents/by-sha256/${sha256}`,
      }),
    );
  });

  it("rejects attachment hash mismatches before creating case or storage state", async () => {
    const response = await post_bundle(
      "actual bytes",
      manifest_for("actual bytes", "f".repeat(64)),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "bundle_attachment_sha256_mismatch:proof.txt",
    });
    expect(state.create_case_with_spine).not.toHaveBeenCalled();
    expect(state.register_upload_intent).not.toHaveBeenCalled();
    expect(state.storage_put).not.toHaveBeenCalled();
  });

  it("quarantines and removes an unpreserved document after an unambiguous receipt failure", async () => {
    state.preserve_document.mockRejectedValueOnce(
      new Error("receipt_insert_rejected"),
    );

    const response = await post_bundle("receipt rejection fixture");
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      completion_state: "partial",
      documents: [],
      document_failures: [
        {
          filename: "proof.txt",
          legacy_document_id: 9001,
          failure_code: "receipt_insert_rejected",
          commit_state: "rejected",
        },
      ],
      summary: {
        documentsUploaded: 0,
        documentsPreserved: 0,
        documentFailures: 1,
      },
    });
    expect(state.delete_document_projection).toHaveBeenCalledTimes(1);
    expect(state.quarantine_upload_intent).toHaveBeenCalledWith(
      expect.objectContaining({
        legacy_document_id: 9001,
        failure_code: "receipt_insert_rejected",
      }),
    );
    expect(state.operations.indexOf("delete_document")).toBeGreaterThan(
      state.operations.indexOf("document"),
    );
    expect(state.operations.indexOf("quarantine")).toBeGreaterThan(
      state.operations.indexOf("delete_document"),
    );
  });

  it("retains the document projection when preservation commit status remains uncertain", async () => {
    const error = Object.assign(
      new Error("intake_transaction_commit_uncertain"),
      { code: "intake_transaction_commit_uncertain" },
    );
    state.preserve_document.mockRejectedValueOnce(error);

    const response = await post_bundle("uncertain commit fixture");
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      completion_state: "partial",
      documents: [],
      document_failures: [
        {
          legacy_document_id: 9001,
          failure_code: "intake_transaction_commit_uncertain",
          commit_state: "uncertain",
        },
      ],
    });
    expect(state.delete_document_projection).not.toHaveBeenCalled();
    expect(state.quarantine_upload_intent).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated sync before parsing durable case state", async () => {
    state.authenticate_request_user.mockRejectedValueOnce(
      new Error("missing_session"),
    );

    const response = await post_bundle("unauthorized fixture");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized — please log in to Luminari first",
    });
    expect(state.create_case_with_spine).not.toHaveBeenCalled();
    expect(state.storage_put).not.toHaveBeenCalled();
  });

  it("mounts only the deterministic server contract with no queue or analysis trigger", () => {
    const source = readFileSync("server/bundle-sync.ts", "utf8");
    const canonical_entry = readFileSync("server/_core/index.ts", "utf8");

    expect(source).toContain("authenticateRequestUser");
    expect(source).toContain("createCaseWithIntakeSpine");
    expect(source).toContain("registerDocumentUploadIntent");
    expect(source).toContain("preserveDocumentInIntakeSpine");
    expect(source).toContain("quarantineDocumentUploadIntent");
    expect(source).not.toContain("enqueueDocument");
    expect(source).not.toContain("sdk.authenticateRequest");
    expect(source).not.toContain("documentsQueued");
    expect(source).not.toContain("updateSnapshotManifest");
    expect(source.indexOf("authenticate_bundle_request,")).toBeLessThan(
      source.indexOf('upload.array("files", 20),'),
    );
    expect(canonical_entry).toContain(
      'import { registerBundleSyncRoute } from "../bundle-sync";',
    );
    expect(canonical_entry).toContain("registerBundleSyncRoute(app);");
  });
});
