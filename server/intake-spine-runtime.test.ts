import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CASE_UUID = "11111111-1111-5111-8111-111111111111";
const SESSION_UUID = "22222222-2222-5222-8222-222222222222";
const ARTIFACT_UUID = "33333333-3333-5333-8333-333333333333";
const LEGACY_DOCUMENT_ID = 9001;
const SNAPSHOT_ID = 77;
const CONTENT_SHA256 = "a".repeat(64);
const PREVIOUS_RECEIPT_HASH = "b".repeat(64);
const STORAGE_PATH = `cases/44/documents/by-sha256/${CONTENT_SHA256}`;
const STORAGE_KEY = `supabase://case-documents/${STORAGE_PATH}`;

type ArtifactState = {
  artifact_id: string;
  artifact_status: string;
  filename: string | null;
  mime_type: string | null;
  byte_size: number | string | null;
  sha256: string | null;
  storage_bucket: string | null;
  storage_object_path: string | null;
};

type DocumentState = {
  id: number;
  filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  sha256_hash: string | null;
  s3_key: string | null;
  s3_url?: string | null;
  snapshot_id: number | null;
};

type LayerRunState = {
  layer_run_id: string;
  input_hash: string;
  output_hash: string;
  receipt: Record<string, unknown>;
  receipt_hash: string;
  previous_receipt_hash: string | null;
  hash_algorithm: string;
  canonicalization_version: string;
};

const state = vi.hoisted(() => ({
  owned: true,
  linked: false,
  artifact: null as ArtifactState | null,
  document: null as DocumentState | null,
  snapshot: null as {
    id: number;
    document_ids: string;
    document_hashes: string;
    snapshot_status: string;
  } | null,
  layer_run: null as LayerRunState | null,
  previous_receipt_hash: null as string | null,
  source_receipt_hash: null as string | null,
  replacement_original: null as {
    id: number;
    status: string | null;
    document_resolution: string | null;
    replaced_by_document_id: string | null;
    snapshot_id: number | null;
  } | null,
  snapshot_update_allowed: true,
  commit_ack_failures: 0,
  connection_count: 0,
  quarantine_updates: 0,
  document_rebinds: 0,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

function artifact_row(): ArtifactState[] {
  return state.artifact ? [{ ...state.artifact }] : [];
}

const client = vi.hoisted(() => ({
  query: vi.fn(async (sql_input: string, params: unknown[] = []) => {
    const sql = sql_input.replace(/\s+/g, " ").trim().toLowerCase();
    state.queries.push({ sql, params });

    if (sql === "begin" || sql === "rollback") return { rows: [] };
    if (sql === "commit") {
      if (state.commit_ack_failures > 0) {
        state.commit_ack_failures -= 1;
        throw new Error("commit_acknowledgement_lost");
      }
      return { rows: [] };
    }
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.startsWith("insert into public.cases")) {
      return { rows: [{ id: 44 }] };
    }
    if (sql.includes("from public.cases") && sql.includes("for update")) {
      return { rows: state.owned ? [{ id: Number(params[0]) }] : [] };
    }
    if (sql.includes("insert into public.case_identity_bridge")) {
      return { rows: [{ case_uuid: CASE_UUID }] };
    }
    if (sql.includes("from public.case_intake_links link")) {
      return {
        rows: state.linked
          ? [{
              intake_session_id: SESSION_UUID,
              owner_user_id: 9,
              session_status: "open",
              session_type: "live",
              fixture_id: null,
            }]
          : [],
      };
    }
    if (sql.includes("insert into public.intake_sessions")) {
      state.linked = true;
      return { rows: [{ intake_session_id: SESSION_UUID }] };
    }
    if (sql.includes("insert into public.case_intake_links"))
      return { rows: [] };

    if (sql.startsWith("update public.documents set s3_key")) {
      if (
        !state.document ||
        state.document.id !== params[6] ||
        params[7] !== 44 ||
        state.document.sha256_hash !== params[8]
      )
        return { rows: [] };
      state.document = {
        ...state.document,
        s3_key: String(params[0]),
        s3_url: String(params[1]),
        file_size: Number(params[2]),
        filename: state.document.filename || String(params[3]),
        mime_type: state.document.mime_type || String(params[4]),
        snapshot_id: Number(params[5]),
      };
      state.document_rebinds += 1;
      return { rows: [{ ...state.document }] };
    }
    if (
      sql.startsWith(
        "select id, filename, mime_type, file_size, sha256_hash, s3_key",
      ) &&
      sql.includes("from public.documents")
    ) {
      return {
        rows:
          state.document && state.document.id === params[0] && params[1] === 44
            ? [{ ...state.document }]
            : [],
      };
    }
    if (
      sql.startsWith("select id, status, document_resolution") &&
      sql.includes("from public.documents")
    ) {
      return {
        rows:
          state.replacement_original &&
          state.replacement_original.id === params[0] &&
          params[1] === 44
            ? [{ ...state.replacement_original }]
            : [],
      };
    }
    if (sql.startsWith("update public.documents set document_resolution")) {
      if (
        !state.replacement_original ||
        state.replacement_original.id !== params[2] ||
        params[3] !== 44 ||
        state.replacement_original.document_resolution === "superseded"
      ) {
        return { rows: [] };
      }
      state.replacement_original.document_resolution = "superseded";
      state.replacement_original.replaced_by_document_id = String(params[0]);
      return { rows: [{ id: state.replacement_original.id }] };
    }
    if (sql.startsWith("select replaced_by_document_id")) {
      return {
        rows:
          state.replacement_original &&
          state.replacement_original.id === params[0] &&
          params[1] === 44
            ? [{
                replaced_by_document_id:
                  state.replacement_original.replaced_by_document_id,
              }]
            : [],
      };
    }

    if (
      sql.startsWith("select document_ids, document_hashes, snapshot_status")
    ) {
      return {
        rows:
          state.snapshot && state.snapshot.id === params[0] && params[1] === 44
            ? [{ ...state.snapshot }]
            : [],
      };
    }
    if (sql.startsWith("update public.corpus_snapshots")) {
      if (
        !state.snapshot_update_allowed ||
        !state.snapshot ||
        state.snapshot.id !== params[2] ||
        params[3] !== 44 ||
        state.snapshot.snapshot_status !== "open"
      ) {
        return { rows: [] };
      }
      state.snapshot.document_ids = String(params[0]);
      state.snapshot.document_hashes = String(params[1]);
      return { rows: [{ id: SNAPSHOT_ID }] };
    }

    if (
      sql.startsWith("select artifact_id") &&
      sql.includes("from public.intake_artifacts")
    ) {
      return { rows: artifact_row() };
    }
    if (sql.startsWith("insert into public.intake_artifacts")) {
      const is_intent = sql.includes("upload_intent_registered");
      state.artifact = is_intent
        ? {
            artifact_id: ARTIFACT_UUID,
            artifact_status: "registered",
            filename: String(params[2]),
            mime_type: String(params[3]),
            byte_size: Number(params[4]),
            sha256: String(params[5]),
            storage_bucket: null,
            storage_object_path: String(params[6]),
          }
        : {
            artifact_id: ARTIFACT_UUID,
            artifact_status: "registered",
            filename: String(params[3]),
            mime_type: String(params[4]),
            byte_size: Number(params[5]),
            sha256: String(params[6]),
            storage_bucket: params[7] === null ? null : String(params[7]),
            storage_object_path: String(params[8]),
          };
      return { rows: artifact_row() };
    }
    if (
      sql.startsWith(
        "update public.intake_artifacts set artifact_status = 'quarantined'",
      )
    ) {
      if (state.artifact && state.artifact.artifact_status !== "preserved") {
        state.artifact.artifact_status = "quarantined";
        state.quarantine_updates += 1;
      }
      return { rows: [] };
    }
    if (
      sql.startsWith(
        "update public.intake_artifacts set artifact_status = 'preserved'",
      )
    ) {
      if (state.artifact) state.artifact.artifact_status = "preserved";
      return { rows: [] };
    }
    if (sql.startsWith("update public.intake_artifacts set filename")) {
      if (!state.artifact) return { rows: [] };
      const is_intent = sql.includes(
        "availability = 'upload_intent_registered'",
      );
      state.artifact = {
        ...state.artifact,
        artifact_status: "registered",
        filename: String(params[0]),
        mime_type: String(params[1]),
        byte_size: Number(params[2]),
        sha256: String(params[3]),
        storage_bucket: is_intent
          ? state.artifact.storage_bucket
          : params[4] === null
            ? null
            : String(params[4]),
        storage_object_path: String(is_intent ? params[4] : params[5]),
      };
      return { rows: artifact_row() };
    }

    if (
      sql.startsWith("select layer_run_id") &&
      sql.includes("from public.intake_layer_runs")
    ) {
      return {
        rows:
          state.layer_run && state.layer_run.input_hash === params[2]
            ? [{ ...state.layer_run }]
            : [],
      };
    }
    if (
      sql.startsWith("select receipt_hash") &&
      sql.includes("from public.intake_layer_runs")
    ) {
      if (sql.includes("receipt ->> 'receipt_type'")) {
        return {
          rows: state.source_receipt_hash
            ? [{ receipt_hash: state.source_receipt_hash }]
            : [],
        };
      }
      return {
        rows: state.previous_receipt_hash
          ? [{
              receipt_hash: state.previous_receipt_hash,
              canonicalization_version: "postgres_jsonb_text_legacy_v1",
            }]
          : [],
      };
    }
    if (sql.startsWith("insert into public.intake_layer_runs")) {
      const receipt = JSON.parse(String(params[9])) as Record<string, unknown>;
      state.layer_run = {
        layer_run_id: String(params[0]),
        input_hash: String(params[5]),
        output_hash: String(params[6]),
        receipt,
        receipt_hash: String(params[10]),
        previous_receipt_hash: params[11] === null ? null : String(params[11]),
        hash_algorithm: String(params[12]),
        canonicalization_version: String(params[13]),
      };
      return { rows: [] };
    }
    if (sql.startsWith("insert into public.intake_verification_records"))
      return { rows: [] };
    if (sql.startsWith("insert into public.intake_state_transitions"))
      return { rows: [] };
    if (sql.startsWith("update public.intake_sessions")) return { rows: [] };

    throw new Error(`unexpected_test_query:${sql}`);
  }),
  release: vi.fn(),
}));

const recovery_client = vi.hoisted(() => ({
  query: vi.fn((sql_input: string, params: unknown[] = []) =>
    client.query(sql_input, params),
  ),
  release: vi.fn(),
}));

const pool_connect = vi.hoisted(() =>
  vi.fn(async () => {
    const connection_index = state.connection_count;
    state.connection_count += 1;
    return connection_index === 0 ? client : recovery_client;
  }),
);

vi.mock("./db", () => ({
  getPool: () => ({
    connect: pool_connect,
  }),
}));

import {
  createCaseWithIntakeSpine,
  intake_spine_testing,
  preserveDocumentInIntakeSpine,
  quarantineDocumentUploadIntent,
  registerDocumentUploadIntent,
  resolveCaseIntakeSpine,
} from "./intake-spine-runtime";

const document_input = {
  legacy_case_id: 44,
  owner_user_id: 9,
  entry_channel: "evidence_upload",
  source_label: "Acceptance upload",
  legacy_document_id: LEGACY_DOCUMENT_ID,
  snapshot_id: SNAPSHOT_ID,
  filename: "proof.txt",
  mime_type: "text/plain",
  byte_size: 17,
  sha256: CONTENT_SHA256,
  storage_key: STORAGE_KEY,
};

const intent_input = {
  legacy_case_id: 44,
  owner_user_id: 9,
  entry_channel: "evidence_upload",
  source_label: "Acceptance upload",
  filename: "proof.txt",
  mime_type: "text/plain",
  byte_size: 17,
  sha256: CONTENT_SHA256,
  planned_storage_object_path: STORAGE_PATH,
};

function canonical_hash(value: unknown): string {
  return createHash("sha256")
    .update(intake_spine_testing.canonicalize(value))
    .digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.owned = true;
  state.linked = false;
  state.artifact = null;
  state.document = {
    id: LEGACY_DOCUMENT_ID,
    filename: "proof.txt",
    mime_type: "text/plain",
    file_size: 17,
    sha256_hash: CONTENT_SHA256,
    s3_key: STORAGE_KEY,
    s3_url: "/api/cases/44/documents/file",
    snapshot_id: SNAPSHOT_ID,
  };
  state.snapshot = {
    id: SNAPSHOT_ID,
    document_ids: "[7]",
    document_hashes: '{"7":"old"}',
    snapshot_status: "open",
  };
  state.layer_run = null;
  state.previous_receipt_hash = null;
  state.source_receipt_hash = null;
  state.replacement_original = null;
  state.snapshot_update_allowed = true;
  state.commit_ack_failures = 0;
  state.connection_count = 0;
  state.quarantine_updates = 0;
  state.document_rebinds = 0;
  state.queries.length = 0;
});

describe("Universal Intake Spine runtime adapter", () => {
  it("resolves a legacy case into one live UUID spine", async () => {
    const first = await resolveCaseIntakeSpine({
      legacy_case_id: 44,
      owner_user_id: 9,
      entry_channel: "guided_intake",
    });
    const second = await resolveCaseIntakeSpine({
      legacy_case_id: 44,
      owner_user_id: 9,
      entry_channel: "case_workspace",
    });

    expect(first).toEqual({
      legacy_case_id: 44,
      case_uuid: CASE_UUID,
      intake_session_id: SESSION_UUID,
    });
    expect(second).toEqual(first);
    expect(
      state.queries.filter((query) =>
        query.sql.includes("insert into public.intake_sessions"),
      ),
    ).toHaveLength(1);
    expect(
      state.queries.filter((query) =>
        query.sql.includes("pg_advisory_xact_lock"),
      ),
    ).toHaveLength(2);
  });

  it("creates the legacy case and UUID intake spine in one transaction", async () => {
    const created = await createCaseWithIntakeSpine({
      owner_user_id: 9,
      name: "  Receipt-backed case  ",
      description: "Atomic identity fixture",
      domain: "  Housing  ",
      pipeline_type: "housing",
      entry_channel: "guided_intake",
    });

    expect(created).toEqual({
      id: 44,
      legacy_case_id: 44,
      case_uuid: CASE_UUID,
      intake_session_id: SESSION_UUID,
    });
    const case_insert = state.queries.find((query) =>
      query.sql.startsWith("insert into public.cases"),
    );
    expect(case_insert?.params).toEqual([
      9,
      "Receipt-backed case",
      "Atomic identity fixture",
      "housing",
      null,
      "housing",
      expect.any(Number),
    ]);
    expect(state.queries[0]?.sql).toBe("begin");
    expect(state.queries.at(-1)?.sql).toBe("commit");
  });

  it("registers and quarantines a content-addressed upload intent without claiming preservation", async () => {
    const intent = await registerDocumentUploadIntent(intent_input);

    expect(intent).toEqual({
      legacy_case_id: 44,
      case_uuid: CASE_UUID,
      intake_session_id: SESSION_UUID,
      artifact_id: ARTIFACT_UUID,
      artifact_key: `sha256:${CONTENT_SHA256}`,
      planned_storage_object_path: STORAGE_PATH,
      intent_state: "registered",
    });
    expect(state.artifact).toMatchObject({
      artifact_status: "registered",
      storage_bucket: null,
      storage_object_path: STORAGE_PATH,
    });
    expect(
      state.queries.some((query) =>
        query.sql.includes("insert into public.intake_layer_runs"),
      ),
    ).toBe(false);

    await quarantineDocumentUploadIntent({
      legacy_case_id: 44,
      owner_user_id: 9,
      sha256: CONTENT_SHA256,
      failure_code: "storage_write_failed",
      legacy_document_id: LEGACY_DOCUMENT_ID,
    });

    expect(state.artifact?.artifact_status).toBe("quarantined");
    expect(state.quarantine_updates).toBe(1);
    expect(
      state.queries.find((query) =>
        query.sql.includes("artifact_status = 'quarantined'"),
      )?.params[0],
    ).toContain("storage_write_failed");
  });

  it("writes a live-compatible receipt chain and an open snapshot manifest", async () => {
    await registerDocumentUploadIntent(intent_input);
    state.previous_receipt_hash = PREVIOUS_RECEIPT_HASH;

    const result = await preserveDocumentInIntakeSpine(document_input);
    const layer_insert = state.queries.find((query) =>
      query.sql.startsWith("insert into public.intake_layer_runs"),
    );
    const verification_insert = state.queries.find((query) =>
      query.sql.startsWith("insert into public.intake_verification_records"),
    );
    const stored_receipt = state.layer_run?.receipt as Record<string, any>;

    expect(result).toMatchObject({
      legacy_case_id: 44,
      case_uuid: CASE_UUID,
      intake_session_id: SESSION_UUID,
      artifact_id: ARTIFACT_UUID,
      legacy_document_id: LEGACY_DOCUMENT_ID,
      snapshot_id: SNAPSHOT_ID,
      sha256: CONTENT_SHA256,
      storage_bucket: "case-documents",
      storage_object_path: STORAGE_PATH,
      previous_receipt_hash: PREVIOUS_RECEIPT_HASH,
      hash_algorithm: "sha256",
      canonicalization_version: "luminari.intake.canonical-json.v2",
      preservation_state: "preserved",
      verification_scope: "request_bytes_and_storage_addressability",
      source_receipt_hash: null,
      replayed: false,
    });
    expect(result.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.output_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.artifact?.artifact_status).toBe("preserved");

    expect(layer_insert?.sql).toContain(
      "receipt_hash, previous_receipt_hash, hash_algorithm, canonicalization_version",
    );
    expect(stored_receipt).toMatchObject({
      artifact_id: ARTIFACT_UUID,
      canonicalization_version: "luminari.intake.canonical-json.v2",
      hash_algorithm: "sha256",
      previous_receipt_hash: PREVIOUS_RECEIPT_HASH,
      previous_canonicalization_version: "postgres_jsonb_text_legacy_v1",
      preservation_mode: "uploaded_bytes",
      receipt_hash: result.receipt_hash,
      receipt_type: "evidence_preservation",
      receipt_version: "2.0.0",
      layer_version: "2.0.0",
      legacy_case_id: "44",
      legacy_document_id: String(LEGACY_DOCUMENT_ID),
      snapshot_id: String(SNAPSHOT_ID),
      source_receipt_hash: null,
      verification_scope: "request_bytes_and_storage_addressability",
    });
    const { receipt_hash: _receipt_hash, ...receipt_payload } = stored_receipt;
    expect(canonical_hash(receipt_payload)).toBe(result.receipt_hash);
    expect(state.layer_run).toMatchObject({
      receipt_hash: result.receipt_hash,
      previous_receipt_hash: PREVIOUS_RECEIPT_HASH,
      hash_algorithm: "sha256",
      canonicalization_version: "luminari.intake.canonical-json.v2",
    });

    expect(verification_insert?.sql).toContain("'supported_by_one_source'");
    expect(JSON.parse(String(verification_insert?.params[4]))).toEqual([
      expect.objectContaining({
        content_truth_verified: false,
        storage_bytes_rehashed: false,
        verification_scope: "request_bytes_and_storage_addressability",
      }),
    ]);
    expect(JSON.parse(state.snapshot?.document_ids ?? "[]")).toEqual([
      7,
      LEGACY_DOCUMENT_ID,
    ]);
    expect(JSON.parse(state.snapshot?.document_hashes ?? "{}")).toEqual({
      "7": "old",
      [String(LEGACY_DOCUMENT_ID)]: CONTENT_SHA256,
    });
    expect(
      state.queries.find((query) =>
        query.sql.startsWith("update public.corpus_snapshots"),
      )?.sql,
    ).toContain("returning id");
  });

  it("links an existing document only through its prior receipt and the same open snapshot", async () => {
    await registerDocumentUploadIntent(intent_input);
    const source_receipt = await preserveDocumentInIntakeSpine(document_input);
    state.source_receipt_hash = source_receipt.receipt_hash;
    state.previous_receipt_hash = source_receipt.receipt_hash;
    state.replacement_original = {
      id: 8000,
      status: "ready",
      document_resolution: "active",
      replaced_by_document_id: null,
      snapshot_id: SNAPSHOT_ID,
    };

    const replacement = await preserveDocumentInIntakeSpine({
      ...document_input,
      entry_channel: "evidence_existing_replacement",
      replaces_legacy_document_id: 8000,
      replacement_reason: "Receipt-backed existing-document replacement",
      preservation_mode: "existing_receipted_document",
      storage_addressability_verified: true,
    });
    const stored_receipt = state.layer_run?.receipt as Record<string, unknown>;

    expect(replacement).toMatchObject({
      preservation_state: "preserved",
      verification_scope: "prior_receipt_and_storage_addressability",
      source_receipt_hash: source_receipt.receipt_hash,
      previous_receipt_hash: source_receipt.receipt_hash,
      replayed: false,
    });
    expect(stored_receipt).toMatchObject({
      preservation_mode: "existing_receipted_document",
      receipt_type: "document_replacement",
      replaces_legacy_document_id: "8000",
      source_receipt_hash: source_receipt.receipt_hash,
      verification_scope: "prior_receipt_and_storage_addressability",
    });
    expect(state.replacement_original).toMatchObject({
      document_resolution: "superseded",
      replaced_by_document_id: String(LEGACY_DOCUMENT_ID),
    });
    const source_lookup = state.queries.find((query) =>
      query.sql.includes("receipt ->> 'receipt_type' = 'evidence_preservation'"),
    );
    expect(source_lookup?.sql).toContain("is_sealed = true");
    expect(source_lookup?.sql).toContain("run_status = 'completed'");
  });

  it("rejects an existing-document replacement without a prior sealed receipt", async () => {
    state.artifact = {
      artifact_id: ARTIFACT_UUID,
      artifact_status: "preserved",
      filename: "proof.txt",
      mime_type: "text/plain",
      byte_size: 17,
      sha256: CONTENT_SHA256,
      storage_bucket: "case-documents",
      storage_object_path: STORAGE_PATH,
    };
    state.replacement_original = {
      id: 8000,
      status: "ready",
      document_resolution: "active",
      replaced_by_document_id: null,
      snapshot_id: SNAPSHOT_ID,
    };

    await expect(
      preserveDocumentInIntakeSpine({
        ...document_input,
        replaces_legacy_document_id: 8000,
        replacement_reason: "No source receipt must fail closed",
        preservation_mode: "existing_receipted_document",
        storage_addressability_verified: true,
      }),
    ).rejects.toThrow("replacement_source_receipt_missing");
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("update public.documents set document_resolution"),
      ),
    ).toBe(false);
  });

  it("returns an immutable exact replay without updating or reinserting a sealed run", async () => {
    await registerDocumentUploadIntent(intent_input);
    const first = await preserveDocumentInIntakeSpine(document_input);
    state.queries.length = 0;

    const replay = await preserveDocumentInIntakeSpine(document_input);

    expect(replay).toMatchObject({
      layer_run_id: first.layer_run_id,
      verification_record_id: first.verification_record_id,
      transition_id: first.transition_id,
      input_hash: first.input_hash,
      output_hash: first.output_hash,
      receipt_hash: first.receipt_hash,
      replayed: true,
    });
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("insert into public.intake_layer_runs"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("update public.intake_layer_runs"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("insert into public.intake_verification_records"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("insert into public.intake_state_transitions"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("update public.corpus_snapshots"),
      ),
    ).toBe(true);
    const replay_lookup = state.queries.find((query) =>
      query.sql.startsWith("select layer_run_id"),
    );
    expect(replay_lookup?.sql).toContain("is_sealed = true");
    expect(replay_lookup?.sql).toContain("run_status = 'completed'");
    expect(replay_lookup?.sql).toContain("completed_at is not null");
  });

  it("evicts an uncertain COMMIT connection and replays one immutable receipt on a fresh client", async () => {
    state.commit_ack_failures = 1;

    const receipt = await preserveDocumentInIntakeSpine(document_input);

    expect(receipt).toMatchObject({
      preservation_state: "preserved",
      replayed: true,
      legacy_document_id: LEGACY_DOCUMENT_ID,
      snapshot_id: SNAPSHOT_ID,
    });
    expect(pool_connect).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(recovery_client.query).toHaveBeenCalled();
    expect(recovery_client.release).toHaveBeenCalledTimes(1);
    expect(recovery_client.release.mock.calls[0]).toEqual([]);
    expect(
      state.queries.filter((query) =>
        query.sql.startsWith("insert into public.intake_layer_runs"),
      ),
    ).toHaveLength(1);
    expect(
      state.queries.some((query) =>
        query.sql.startsWith("update public.intake_layer_runs"),
      ),
    ).toBe(false);
    expect(
      state.queries.filter((query) =>
        query.sql.startsWith("insert into public.intake_verification_records"),
      ),
    ).toHaveLength(1);
    expect(
      state.queries.filter((query) =>
        query.sql.startsWith("insert into public.intake_state_transitions"),
      ),
    ).toHaveLength(1);
    expect(
      state.queries.filter((query) => query.sql === "rollback"),
    ).toHaveLength(0);
  });

  it("rejects a document outside the owned case before creating artifact or receipt state", async () => {
    state.document = null;

    await expect(preserveDocumentInIntakeSpine(document_input)).rejects.toThrow(
      "legacy_document_not_found_for_case",
    );

    expect(state.queries.some((query) => query.sql === "rollback")).toBe(true);
    expect(
      state.queries.some((query) =>
        query.sql.includes("from public.intake_artifacts"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.includes("insert into public.intake_layer_runs"),
      ),
    ).toBe(false);
  });

  it("rejects a document bound to a different snapshot before creating artifact or receipt state", async () => {
    if (state.document) state.document.snapshot_id = SNAPSHOT_ID + 1;

    await expect(preserveDocumentInIntakeSpine(document_input)).rejects.toThrow(
      "legacy_document_snapshot_mismatch",
    );

    expect(state.queries.some((query) => query.sql === "rollback")).toBe(true);
    expect(
      state.queries.some((query) =>
        query.sql.includes("from public.corpus_snapshots"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.includes("from public.intake_artifacts"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.includes("insert into public.intake_layer_runs"),
      ),
    ).toBe(false);
  });

  it("rejects a sealed snapshot before creating artifact or receipt state", async () => {
    if (state.snapshot) state.snapshot.snapshot_status = "sealed";

    await expect(preserveDocumentInIntakeSpine(document_input)).rejects.toThrow(
      "corpus_snapshot_not_open",
    );

    expect(state.queries.some((query) => query.sql === "rollback")).toBe(true);
    expect(
      state.queries.some((query) =>
        query.sql.includes("from public.intake_artifacts"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.includes("insert into public.intake_layer_runs"),
      ),
    ).toBe(false);
  });

  it("rolls back when the guarded snapshot manifest update returns no row", async () => {
    await registerDocumentUploadIntent(intent_input);
    state.snapshot_update_allowed = false;

    await expect(preserveDocumentInIntakeSpine(document_input)).rejects.toThrow(
      "corpus_snapshot_manifest_update_rejected",
    );

    expect(state.queries.some((query) => query.sql === "rollback")).toBe(true);
    expect(
      state.queries.find((query) =>
        query.sql.startsWith("update public.corpus_snapshots"),
      )?.sql,
    ).toContain("snapshot_status = 'open' returning id");
  });

  it.each([
    ["malformed document IDs", "{not-json", '{"7":"old"}'],
    ["wrong-shape document hashes", "[7]", "[]"],
  ])(
    "fails closed for %s in an open snapshot manifest",
    async (_label, document_ids, document_hashes) => {
      if (state.snapshot) {
        state.snapshot.document_ids = document_ids;
        state.snapshot.document_hashes = document_hashes;
      }

      await expect(
        preserveDocumentInIntakeSpine(document_input),
      ).rejects.toThrow("corpus_snapshot_manifest_invalid");

      expect(state.queries.some((query) => query.sql === "rollback")).toBe(
        true,
      );
      expect(
        state.queries.some((query) =>
          query.sql.startsWith("update public.corpus_snapshots"),
        ),
      ).toBe(false);
    },
  );

  it("optionally rebinds a legacy document to its verified content-addressed storage key", async () => {
    if (state.document) {
      state.document.s3_key = "cases/44/documents/legacy-proof.txt";
      state.document.s3_url = "https://legacy.invalid/proof.txt";
    }

    const result = await preserveDocumentInIntakeSpine({
      ...document_input,
      allow_legacy_storage_rebind: true,
      legacy_document_access_url: `/api/cases/44/documents/file?key=${encodeURIComponent(STORAGE_KEY)}`,
    });

    expect(result.preservation_state).toBe("preserved");
    expect(state.document_rebinds).toBe(1);
    expect(state.document).toMatchObject({
      s3_key: STORAGE_KEY,
      s3_url: `/api/cases/44/documents/file?key=${encodeURIComponent(STORAGE_KEY)}`,
    });
    const rebind = state.queries.find((query) =>
      query.sql.startsWith("update public.documents set s3_key"),
    );
    expect(rebind?.params).toMatchObject([
      STORAGE_KEY,
      expect.stringContaining("/api/cases/44/documents/file?key="),
      17,
      "proof.txt",
      "text/plain",
      SNAPSHOT_ID,
      LEGACY_DOCUMENT_ID,
      44,
      CONTENT_SHA256,
    ]);
  });

  it("rejects the wrong owner before creating bridge or artifact state", async () => {
    state.owned = false;

    await expect(registerDocumentUploadIntent(intent_input)).rejects.toThrow(
      "case_identity_unresolved",
    );

    expect(state.queries.some((query) => query.sql === "rollback")).toBe(true);
    expect(
      state.queries.some((query) =>
        query.sql.includes("insert into public.case_identity_bridge"),
      ),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.sql.includes("insert into public.intake_artifacts"),
      ),
    ).toBe(false);
  });

  it("uses the live canonical version and keeps inference outside the preservation adapter", () => {
    expect(intake_spine_testing.canonicalization_version).toBe(
      "luminari.intake.canonical-json.v2",
    );
    expect(intake_spine_testing.canonicalize({ b: 2, a: [3, 1] })).toBe(
      '{"a":[3,1],"b":2}',
    );
    expect(intake_spine_testing.deterministic_uuid("same-input")).toBe(
      intake_spine_testing.deterministic_uuid("same-input"),
    );
    expect(intake_spine_testing.parse_storage_key(STORAGE_KEY)).toEqual({
      storage_bucket: "case-documents",
      storage_object_path: STORAGE_PATH,
    });

    const source = readFileSync(
      fileURLToPath(new URL("./intake-spine-runtime.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("public.intake_verification_records");
    expect(source).toContain("public.intake_state_transitions");
    expect(source).toContain("'supported_by_one_source'");
    expect(source).not.toContain("'verification_gate'");
    expect(source).not.toContain("'inference'");
  });
});
