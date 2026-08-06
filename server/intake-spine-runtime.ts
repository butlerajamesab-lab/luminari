import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./db";
import { canonicalSerialize, computeCanonicalHash } from "./lib/determinism";

const IDENTITY_VERSION = "1.0.0";
const PRESERVATION_LAYER_VERSION = "2.0.0";
const PRESERVATION_RULE_VERSION = "sha256-byte-identity-1.0.0";
const CANONICALIZATION_VERSION = "luminari.intake.canonical-json.v2";
const HASH_ALGORITHM = "sha256" as const;

type PreservationMode = "uploaded_bytes" | "existing_receipted_document";
type PreservationVerificationScope =
  | "request_bytes_and_storage_addressability"
  | "prior_receipt_and_storage_addressability";

type CaseSpine = {
  legacy_case_id: number;
  case_uuid: string;
  intake_session_id: string;
};

export type UploadIntentReceipt = CaseSpine & {
  artifact_id: string;
  artifact_key: string;
  planned_storage_object_path: string;
  intent_state: "registered" | "already_preserved";
};

export type PreservationReceipt = CaseSpine & {
  artifact_id: string;
  layer_run_id: string;
  verification_record_id: string;
  transition_id: string;
  legacy_document_id: number;
  snapshot_id: number;
  sha256: string;
  storage_bucket: string | null;
  storage_object_path: string;
  input_hash: string;
  output_hash: string;
  receipt_hash: string;
  previous_receipt_hash: string | null;
  hash_algorithm: typeof HASH_ALGORITHM;
  canonicalization_version: typeof CANONICALIZATION_VERSION;
  preservation_state: "preserved";
  verification_scope: PreservationVerificationScope;
  source_receipt_hash: string | null;
  replayed: boolean;
};

type ResolveCaseSpineInput = {
  legacy_case_id: number;
  owner_user_id: number;
  entry_channel?: string;
  source_label?: string;
};

type CreateCaseWithSpineInput = {
  owner_user_id: number;
  name: string;
  description?: string;
  domain?: string;
  container?: string;
  pipeline_type?: string;
  entry_channel: string;
};

export type CreatedCaseSpine = CaseSpine & { id: number };

type UploadIntentInput = ResolveCaseSpineInput & {
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  planned_storage_object_path: string;
};

type QuarantineUploadIntentInput = ResolveCaseSpineInput & {
  sha256: string;
  failure_code: string;
  legacy_document_id?: number;
};

type PreserveDocumentInput = ResolveCaseSpineInput & {
  legacy_document_id: number;
  snapshot_id: number;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  storage_key: string;
  legacy_document_access_url?: string;
  allow_legacy_storage_rebind?: boolean;
  replaces_legacy_document_id?: number;
  replacement_reason?: string;
  preservation_mode?: PreservationMode;
  storage_addressability_verified?: boolean;
};

type ArtifactRow = {
  artifact_id: string;
  artifact_status: string;
  filename: string | null;
  mime_type: string | null;
  byte_size: string | number | null;
  sha256: string | null;
  storage_bucket: string | null;
  storage_object_path: string | null;
};

type LayerRunRow = {
  layer_run_id: string;
  input_hash: string;
  output_hash: string;
  receipt: unknown;
  receipt_hash: string;
  previous_receipt_hash: string | null;
  hash_algorithm: string;
  canonicalization_version: string;
};

export class IntakeTransactionCommitUncertainError extends Error {
  readonly code = "intake_transaction_commit_uncertain";

  constructor(cause: unknown) {
    super("intake_transaction_commit_uncertain", { cause });
    this.name = "IntakeTransactionCommitUncertainError";
  }
}

export function isIntakeTransactionCommitUncertainError(
  error: unknown,
): error is IntakeTransactionCommitUncertainError {
  return (
    error instanceof IntakeTransactionCommitUncertainError ||
    Boolean(
      error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "intake_transaction_commit_uncertain",
    )
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministic_uuid(value: string): string {
  const hash = sha256(value);
  const variant = ((Number.parseInt(hash[16] ?? "8", 16) & 0x3) | 0x8).toString(
    16,
  );
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function assert_preservation_identity(input: {
  legacy_case_id: number;
  byte_size: number;
  sha256: string;
}): void {
  if (!Number.isInteger(input.legacy_case_id) || input.legacy_case_id <= 0) {
    throw new Error("legacy_case_id_invalid");
  }
  if (!Number.isInteger(input.byte_size) || input.byte_size < 0) {
    throw new Error("artifact_byte_size_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
    throw new Error("artifact_sha256_invalid");
  }
}

function parse_storage_key(storage_key: string): {
  storage_bucket: string | null;
  storage_object_path: string;
} {
  const prefix = "supabase://";
  if (!storage_key.startsWith(prefix)) {
    if (!storage_key.trim()) throw new Error("artifact_storage_key_malformed");
    return { storage_bucket: null, storage_object_path: storage_key };
  }

  const remainder = storage_key.slice(prefix.length);
  const separator = remainder.indexOf("/");
  if (separator <= 0 || separator >= remainder.length - 1) {
    throw new Error("artifact_storage_key_malformed");
  }

  return {
    storage_bucket: remainder.slice(0, separator),
    storage_object_path: remainder.slice(separator + 1),
  };
}

function parse_json_array(value: unknown): number[] {
  let parsed = value;
  if (typeof value === "string") {
    if (!value.trim()) throw new Error("corpus_snapshot_manifest_invalid");
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("corpus_snapshot_manifest_invalid");
    }
  }
  if (!Array.isArray(parsed))
    throw new Error("corpus_snapshot_manifest_invalid");
  const document_ids = parsed.map(Number);
  if (document_ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("corpus_snapshot_manifest_invalid");
  }
  return document_ids;
}

function parse_json_record(value: unknown): Record<string, string> {
  let parsed = value;
  if (typeof value === "string") {
    if (!value.trim()) throw new Error("corpus_snapshot_manifest_invalid");
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("corpus_snapshot_manifest_invalid");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("corpus_snapshot_manifest_invalid");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (
    entries.some(
      ([key, nested]) => !/^\d+$/.test(key) || typeof nested !== "string",
    )
  ) {
    throw new Error("corpus_snapshot_manifest_invalid");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function parse_json_object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function assert_artifact_row_matches(
  artifact: ArtifactRow,
  expected: {
    byte_size: number;
    sha256: string;
    storage_bucket: string | null;
    storage_object_path: string;
  },
): void {
  if (artifact.sha256 && artifact.sha256 !== expected.sha256) {
    throw new Error("intake_artifact_sha256_conflict");
  }
  if (
    artifact.byte_size !== null &&
    Number(artifact.byte_size) !== expected.byte_size
  ) {
    throw new Error("intake_artifact_byte_size_conflict");
  }
  if (
    artifact.storage_bucket &&
    artifact.storage_bucket !== expected.storage_bucket
  ) {
    throw new Error("intake_artifact_storage_bucket_conflict");
  }
  if (
    artifact.storage_object_path &&
    artifact.storage_object_path !== expected.storage_object_path
  ) {
    throw new Error("intake_artifact_storage_path_conflict");
  }
}

async function in_transaction<T>(
  task: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let released = false;
  try {
    await client.query("begin");
    const result = await task(client);
    try {
      await client.query("commit");
    } catch (error) {
      // PostgreSQL commit acknowledgement failures are inherently ambiguous:
      // the transaction may already be durable. Evict this connection and let
      // receipt-aware callers recover by replaying on a fresh connection.
      client.release(error as Error);
      released = true;
      throw new IntakeTransactionCommitUncertainError(error);
    }
    return result;
  } catch (error) {
    if (!isIntakeTransactionCommitUncertainError(error)) {
      await client.query("rollback").catch(() => undefined);
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}

async function resolve_case_spine_with_client(
  client: PoolClient,
  input: ResolveCaseSpineInput,
): Promise<CaseSpine> {
  await client.query("select pg_advisory_xact_lock($1::integer)", [
    input.legacy_case_id,
  ]);

  const owned_case = await client.query<{ id: number }>(
    `select id
       from public.cases
      where id = $1 and user_id = $2
      for update`,
    [input.legacy_case_id, input.owner_user_id],
  );
  if (!owned_case.rows[0]) throw new Error("case_identity_unresolved");

  const bridge = await client.query<{ case_uuid: string }>(
    `insert into public.case_identity_bridge (
       legacy_case_id, identity_version, metadata
     ) values ($1, $2, $3::jsonb)
     on conflict (legacy_case_id) do update
       set identity_version = excluded.identity_version,
           metadata = public.case_identity_bridge.metadata || excluded.metadata,
           updated_at = now()
     returning case_uuid`,
    [
      input.legacy_case_id,
      IDENTITY_VERSION,
      JSON.stringify({
        adapter: "lighthouse_intake_spine",
        legacy_case_id: input.legacy_case_id,
      }),
    ],
  );
  const case_uuid = bridge.rows[0]?.case_uuid;
  if (!case_uuid) throw new Error("case_identity_bridge_not_persisted");

  const linked_sessions = await client.query<{
    intake_session_id: string;
    owner_user_id: number | null;
    session_status: string;
    session_type: string;
    fixture_id: string | null;
  }>(
    `select session.intake_session_id, session.owner_user_id,
            session.session_status, session.session_type, session.fixture_id
       from public.case_intake_links link
       join public.intake_sessions session
         on session.intake_session_id = link.intake_session_id
      where link.case_uuid = $1::uuid
        and link.is_primary = true
      order by session.created_at asc, session.intake_session_id asc
      for update of link, session`,
    [case_uuid],
  );

  if (linked_sessions.rows.length > 1) {
    throw new Error("multiple_primary_intake_sessions_for_case");
  }

  const linked_session = linked_sessions.rows[0];
  if (
    linked_session &&
    linked_session.owner_user_id !== null &&
    linked_session.owner_user_id !== input.owner_user_id
  ) {
    throw new Error("intake_session_owner_mismatch");
  }

  const reusable_session =
    linked_session?.session_type === "live" &&
    linked_session.fixture_id === null &&
    (linked_session.session_status === "open" ||
      linked_session.session_status === "paused")
      ? linked_session
      : null;

  let intake_session_id = reusable_session?.intake_session_id;
  if (!intake_session_id) {
    if (linked_session) {
      await client.query(
        `update public.case_intake_links
            set is_primary = false
          where case_uuid = $1::uuid and is_primary = true`,
        [case_uuid],
      );
    }

    const source_fingerprint = sha256(
      `lighthouse:legacy-case:${input.legacy_case_id}`,
    );
    const inserted_session = await client.query<{ intake_session_id: string }>(
      `insert into public.intake_sessions (
         owner_user_id, session_type, entry_channel, source_label,
         privacy_mode, session_status, completion_state,
         source_fingerprint, metadata
       ) values ($1, 'live', $2, $3, 'restricted', 'open', 'started', $4, $5::jsonb)
       returning intake_session_id`,
      [
        input.owner_user_id,
        input.entry_channel ?? "legacy_case_workspace",
        input.source_label ?? `Lighthouse case ${input.legacy_case_id}`,
        source_fingerprint,
        JSON.stringify({
          legacy_case_id: input.legacy_case_id,
          adapter_version: IDENTITY_VERSION,
        }),
      ],
    );
    intake_session_id = inserted_session.rows[0]?.intake_session_id;
    if (!intake_session_id) throw new Error("intake_session_not_persisted");

    await client.query(
      `insert into public.case_intake_links (
         intake_session_id, case_uuid, link_type, is_primary, metadata
       ) values ($1::uuid, $2::uuid, 'primary_projection', true, $3::jsonb)
       on conflict (intake_session_id, case_uuid) do update
         set is_primary = true,
             metadata = public.case_intake_links.metadata || excluded.metadata`,
      [
        intake_session_id,
        case_uuid,
        JSON.stringify({
          legacy_case_id: input.legacy_case_id,
          adapter_version: IDENTITY_VERSION,
        }),
      ],
    );
  }

  return { legacy_case_id: input.legacy_case_id, case_uuid, intake_session_id };
}

export async function resolve_case_intake_spine(
  input: ResolveCaseSpineInput,
): Promise<CaseSpine> {
  return in_transaction((client) =>
    resolve_case_spine_with_client(client, input),
  );
}

export async function create_case_with_intake_spine(
  input: CreateCaseWithSpineInput,
): Promise<CreatedCaseSpine> {
  const name = input.name.trim();
  if (!name) throw new Error("case_name_required");
  const normalized_domain = input.domain?.trim().toLowerCase() || null;
  const now = Date.now();

  return in_transaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `insert into public.cases (
         user_id, name, description, domain, container, pipeline_type,
         created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $7)
       returning id`,
      [
        input.owner_user_id,
        name,
        input.description ?? null,
        normalized_domain,
        input.container ?? null,
        input.pipeline_type ?? null,
        now,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("case_not_persisted");

    const spine = await resolve_case_spine_with_client(client, {
      legacy_case_id: id,
      owner_user_id: input.owner_user_id,
      entry_channel: input.entry_channel,
      source_label: name,
    });

    return { id, ...spine };
  });
}

export async function register_document_upload_intent(
  input: UploadIntentInput,
): Promise<UploadIntentReceipt> {
  assert_preservation_identity(input);
  const expected_path = `cases/${input.legacy_case_id}/documents/by-sha256/${input.sha256}`;
  if (input.planned_storage_object_path !== expected_path) {
    throw new Error("upload_intent_storage_path_not_content_addressed");
  }

  return in_transaction(async (client) => {
    const spine = await resolve_case_spine_with_client(client, input);
    const artifact_key = `sha256:${input.sha256}`;
    const existing = await client.query<ArtifactRow>(
      `select artifact_id, artifact_status, filename, mime_type, byte_size, sha256,
              storage_bucket, storage_object_path
         from public.intake_artifacts
        where intake_session_id = $1::uuid and artifact_key = $2
        for update`,
      [spine.intake_session_id, artifact_key],
    );

    let artifact = existing.rows[0];
    if (artifact) {
      assert_artifact_row_matches(artifact, {
        byte_size: input.byte_size,
        sha256: input.sha256,
        storage_bucket: artifact.storage_bucket,
        storage_object_path: expected_path,
      });
      if (artifact.artifact_status !== "preserved") {
        const updated = await client.query<ArtifactRow>(
          `update public.intake_artifacts
              set filename = $1,
                  mime_type = $2,
                  byte_size = $3,
                  sha256 = $4,
                  source_family = 'direct_upload',
                  artifact_type = 'source_document',
                  evidence_tier = 'primary_source',
                  availability = 'upload_intent_registered',
                  storage_object_path = $5,
                  privacy_classification = 'restricted',
                  artifact_status = 'registered',
                  metadata = metadata || $6::jsonb,
                  updated_at = now()
            where artifact_id = $7::uuid
            returning artifact_id, artifact_status, filename, mime_type, byte_size, sha256,
                      storage_bucket, storage_object_path`,
          [
            input.filename,
            input.mime_type,
            input.byte_size,
            input.sha256,
            expected_path,
            JSON.stringify({
              legacy_case_id: input.legacy_case_id,
              planned_storage_object_path: expected_path,
              intent_registered: true,
            }),
            artifact.artifact_id,
          ],
        );
        artifact = updated.rows[0];
      }
    } else {
      const inserted = await client.query<ArtifactRow>(
        `insert into public.intake_artifacts (
           intake_session_id, artifact_key, source_family, artifact_type,
           evidence_tier, availability, filename, mime_type, byte_size, sha256,
           storage_object_path, privacy_classification, artifact_status, metadata
         ) values (
           $1::uuid, $2, 'direct_upload', 'source_document',
           'primary_source', 'upload_intent_registered', $3, $4, $5, $6,
           $7, 'restricted', 'registered', $8::jsonb
         )
         returning artifact_id, artifact_status, filename, mime_type, byte_size, sha256,
                   storage_bucket, storage_object_path`,
        [
          spine.intake_session_id,
          artifact_key,
          input.filename,
          input.mime_type,
          input.byte_size,
          input.sha256,
          expected_path,
          JSON.stringify({
            legacy_case_id: input.legacy_case_id,
            planned_storage_object_path: expected_path,
            intent_registered: true,
          }),
        ],
      );
      artifact = inserted.rows[0];
    }

    if (!artifact?.artifact_id) throw new Error("upload_intent_not_persisted");
    return {
      ...spine,
      artifact_id: artifact.artifact_id,
      artifact_key,
      planned_storage_object_path: expected_path,
      intent_state:
        artifact.artifact_status === "preserved"
          ? "already_preserved"
          : "registered",
    };
  });
}

export async function quarantine_document_upload_intent(
  input: QuarantineUploadIntentInput,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) return;
  await in_transaction(async (client) => {
    const spine = await resolve_case_spine_with_client(client, input);
    await client.query(
      `update public.intake_artifacts
          set artifact_status = 'quarantined',
              availability = 'storage_or_persistence_incomplete',
              metadata = metadata || $1::jsonb,
              updated_at = now()
        where intake_session_id = $2::uuid
          and artifact_key = $3
          and artifact_status <> 'preserved'`,
      [
        JSON.stringify({
          failure_code: input.failure_code.slice(0, 256),
          legacy_document_id: input.legacy_document_id ?? null,
          quarantined: true,
        }),
        spine.intake_session_id,
        `sha256:${input.sha256}`,
      ],
    );
  });
}

async function update_open_snapshot_manifest(
  client: PoolClient,
  input: PreserveDocumentInput,
  snapshot: { document_ids: unknown; document_hashes: unknown },
): Promise<void> {
  const document_ids = parse_json_array(snapshot.document_ids);
  if (!document_ids.includes(input.legacy_document_id)) {
    document_ids.push(input.legacy_document_id);
    document_ids.sort((left, right) => left - right);
  }
  const document_hashes = parse_json_record(snapshot.document_hashes);
  document_hashes[String(input.legacy_document_id)] = input.sha256;

  const updated = await client.query<{ id: number }>(
    `update public.corpus_snapshots
        set document_ids = $1,
            document_hashes = $2
      where id = $3 and case_id = $4 and snapshot_status = 'open'
      returning id`,
    [
      JSON.stringify(document_ids),
      JSON.stringify(document_hashes),
      input.snapshot_id,
      input.legacy_case_id,
    ],
  );
  if (!updated.rows[0])
    throw new Error("corpus_snapshot_manifest_update_rejected");
}

async function finalize_replacement_projection(
  client: PoolClient,
  input: PreserveDocumentInput,
): Promise<void> {
  if (!input.replaces_legacy_document_id) return;

  const replacement = await client.query<{ id: number }>(
    `update public.documents
        set document_resolution = 'superseded',
            replaced_by_document_id = $1,
            resolution_reason = $2
      where id = $3
        and case_id = $4
        and coalesce(document_resolution, 'active') <> 'superseded'
      returning id`,
    [
      String(input.legacy_document_id),
      input.replacement_reason ?? "receipt_backed_upload_replacement",
      input.replaces_legacy_document_id,
      input.legacy_case_id,
    ],
  );
  if (replacement.rows[0]) return;

  const existing = await client.query<{
    replaced_by_document_id: string | null;
  }>(
    `select replaced_by_document_id
       from public.documents
      where id = $1 and case_id = $2`,
    [input.replaces_legacy_document_id, input.legacy_case_id],
  );
  if (
    existing.rows[0]?.replaced_by_document_id !==
    String(input.legacy_document_id)
  ) {
    throw new Error("replacement_projection_conflict");
  }
}

export async function preserve_document_in_intake_spine(
  input: PreserveDocumentInput,
): Promise<PreservationReceipt> {
  assert_preservation_identity(input);
  if (
    !Number.isInteger(input.legacy_document_id) ||
    input.legacy_document_id <= 0
  ) {
    throw new Error("legacy_document_id_invalid");
  }
  if (!Number.isInteger(input.snapshot_id) || input.snapshot_id <= 0) {
    throw new Error("snapshot_id_invalid");
  }

  const run_preservation = (): Promise<PreservationReceipt> =>
    in_transaction<PreservationReceipt>(async (client) => {
      const spine = await resolve_case_spine_with_client(client, input);
      const storage = parse_storage_key(input.storage_key);
      const preservation_mode = input.preservation_mode ?? "uploaded_bytes";
      const verification_scope: PreservationVerificationScope =
        preservation_mode === "existing_receipted_document"
          ? "prior_receipt_and_storage_addressability"
          : "request_bytes_and_storage_addressability";
      if (
        preservation_mode === "existing_receipted_document" &&
        (!input.replaces_legacy_document_id ||
          input.storage_addressability_verified !== true)
      ) {
        throw new Error("existing_replacement_verification_incomplete");
      }
      const expected_path = `cases/${input.legacy_case_id}/documents/by-sha256/${input.sha256}`;
      if (storage.storage_object_path !== expected_path) {
        throw new Error("artifact_storage_path_not_content_addressed");
      }

      type LegacyDocumentRow = {
        id: number;
        filename: string | null;
        mime_type: string | null;
        file_size: number | null;
        sha256_hash: string | null;
        s3_key: string | null;
        snapshot_id: number | null;
      };
      let document_row: LegacyDocumentRow | undefined;
      if (input.allow_legacy_storage_rebind) {
        if (!input.legacy_document_access_url?.trim()) {
          throw new Error("legacy_document_access_url_required_for_rebind");
        }
        const rebound = await client.query<LegacyDocumentRow>(
          `update public.documents
            set s3_key = $1,
                s3_url = $2,
                file_size = $3,
                filename = coalesce(nullif(filename, ''), $4),
                mime_type = coalesce(nullif(mime_type, ''), $5),
                snapshot_id = $6
          where id = $7
            and case_id = $8
            and sha256_hash = $9
          returning id, filename, mime_type, file_size, sha256_hash, s3_key, snapshot_id`,
          [
            input.storage_key,
            input.legacy_document_access_url,
            input.byte_size,
            input.filename,
            input.mime_type,
            input.snapshot_id,
            input.legacy_document_id,
            input.legacy_case_id,
            input.sha256,
          ],
        );
        document_row = rebound.rows[0];
        if (!document_row)
          throw new Error("legacy_document_storage_rebind_rejected");
      } else {
        const document = await client.query<LegacyDocumentRow>(
          `select id, filename, mime_type, file_size, sha256_hash, s3_key, snapshot_id
           from public.documents
          where id = $1 and case_id = $2
          for update`,
          [input.legacy_document_id, input.legacy_case_id],
        );
        document_row = document.rows[0];
      }
      if (!document_row) throw new Error("legacy_document_not_found_for_case");
      if (document_row.sha256_hash !== input.sha256)
        throw new Error("legacy_document_sha256_mismatch");
      if (document_row.s3_key !== input.storage_key)
        throw new Error("legacy_document_storage_key_mismatch");
      if (document_row.file_size !== input.byte_size)
        throw new Error("legacy_document_byte_size_mismatch");
      if (document_row.filename !== input.filename)
        throw new Error("legacy_document_filename_mismatch");
      if (document_row.mime_type !== input.mime_type)
        throw new Error("legacy_document_mime_type_mismatch");
      if (document_row.snapshot_id !== input.snapshot_id)
        throw new Error("legacy_document_snapshot_mismatch");

      const snapshot_result = await client.query<{
        document_ids: unknown;
        document_hashes: unknown;
        snapshot_status: string;
      }>(
        `select document_ids, document_hashes, snapshot_status
         from public.corpus_snapshots
        where id = $1 and case_id = $2
        for update`,
        [input.snapshot_id, input.legacy_case_id],
      );
      const snapshot = snapshot_result.rows[0];
      if (!snapshot) throw new Error("corpus_snapshot_not_found_for_case");
      if (snapshot.snapshot_status !== "open")
        throw new Error("corpus_snapshot_not_open");

      if (input.replaces_legacy_document_id) {
        if (input.replaces_legacy_document_id === input.legacy_document_id) {
          throw new Error("replacement_document_self_reference");
        }
        const original = await client.query<{
          id: number;
          status: string | null;
          document_resolution: string | null;
          replaced_by_document_id: string | null;
          snapshot_id: number | null;
        }>(
          `select id, status, document_resolution, replaced_by_document_id, snapshot_id
           from public.documents
          where id = $1 and case_id = $2
          for update`,
          [input.replaces_legacy_document_id, input.legacy_case_id],
        );
        const original_row = original.rows[0];
        if (!original_row)
          throw new Error("replacement_original_not_found_for_case");
        if (original_row.snapshot_id !== input.snapshot_id) {
          throw new Error("replacement_original_snapshot_not_open_projection");
        }
        const resolution = original_row.document_resolution ?? "active";
        if (
          resolution === "superseded" &&
          original_row.replaced_by_document_id !==
            String(input.legacy_document_id)
        ) {
          throw new Error("replacement_original_already_superseded");
        }
      }

      const artifact_key = `sha256:${input.sha256}`;
      const artifact_result = await client.query<ArtifactRow>(
        `select artifact_id, artifact_status, filename, mime_type, byte_size, sha256,
              storage_bucket, storage_object_path
         from public.intake_artifacts
        where intake_session_id = $1::uuid and artifact_key = $2
        for update`,
        [spine.intake_session_id, artifact_key],
      );
      let artifact = artifact_result.rows[0];
      if (artifact) {
        assert_artifact_row_matches(artifact, {
          byte_size: input.byte_size,
          sha256: input.sha256,
          storage_bucket: storage.storage_bucket,
          storage_object_path: storage.storage_object_path,
        });
        if (
          preservation_mode === "existing_receipted_document" &&
          artifact.artifact_status !== "preserved"
        ) {
          throw new Error("replacement_source_artifact_not_preserved");
        }
        if (artifact.artifact_status !== "preserved") {
          const updated = await client.query<ArtifactRow>(
            `update public.intake_artifacts
              set filename = $1,
                  mime_type = $2,
                  byte_size = $3,
                  sha256 = $4,
                  storage_bucket = $5,
                  storage_object_path = $6,
                  availability = $7,
                  artifact_status = 'registered',
                  metadata = metadata || $8::jsonb,
                  updated_at = now()
            where artifact_id = $9::uuid
            returning artifact_id, artifact_status, filename, mime_type, byte_size, sha256,
                      storage_bucket, storage_object_path`,
            [
              input.filename,
              input.mime_type,
              input.byte_size,
              input.sha256,
              storage.storage_bucket,
              storage.storage_object_path,
              storage.storage_bucket
                ? "private_object_addressable"
                : "stored_object_addressable",
              JSON.stringify({
                legacy_case_id: input.legacy_case_id,
                legacy_document_id: input.legacy_document_id,
                source_storage_key: input.storage_key,
                preservation_rule_version: PRESERVATION_RULE_VERSION,
              }),
              artifact.artifact_id,
            ],
          );
          artifact = updated.rows[0];
        }
      } else if (preservation_mode === "existing_receipted_document") {
        throw new Error("replacement_source_artifact_not_found");
      } else {
        const inserted = await client.query<ArtifactRow>(
          `insert into public.intake_artifacts (
           intake_session_id, artifact_key, source_family, artifact_type,
           evidence_tier, availability, filename, mime_type, byte_size, sha256,
           storage_bucket, storage_object_path, privacy_classification,
           artifact_status, metadata
         ) values (
           $1::uuid, $2, 'direct_upload', 'source_document',
           'primary_source', $3, $4, $5, $6, $7,
           $8, $9, 'restricted', 'registered', $10::jsonb
         )
         returning artifact_id, artifact_status, filename, mime_type, byte_size, sha256,
                   storage_bucket, storage_object_path`,
          [
            spine.intake_session_id,
            artifact_key,
            storage.storage_bucket
              ? "private_object_addressable"
              : "stored_object_addressable",
            input.filename,
            input.mime_type,
            input.byte_size,
            input.sha256,
            storage.storage_bucket,
            storage.storage_object_path,
            JSON.stringify({
              legacy_case_id: input.legacy_case_id,
              legacy_document_id: input.legacy_document_id,
              source_storage_key: input.storage_key,
              preservation_rule_version: PRESERVATION_RULE_VERSION,
            }),
          ],
        );
        artifact = inserted.rows[0];
      }
      if (!artifact?.artifact_id)
        throw new Error("intake_artifact_not_persisted");

      let source_receipt_hash: string | null = null;
      if (preservation_mode === "existing_receipted_document") {
        const source_receipt = await client.query<{ receipt_hash: string }>(
          `select receipt_hash
             from public.intake_layer_runs
            where intake_session_id = $1::uuid
              and is_sealed = true
              and run_status = 'completed'
              and completed_at is not null
              and receipt_hash is not null
              and receipt ->> 'receipt_type' = 'evidence_preservation'
              and receipt ->> 'artifact_id' = $2
              and receipt ->> 'legacy_document_id' = $3
            order by sealed_at desc, layer_run_id desc
            limit 1
            for update`,
          [
            spine.intake_session_id,
            artifact.artifact_id,
            String(input.legacy_document_id),
          ],
        );
        source_receipt_hash = source_receipt.rows[0]?.receipt_hash ?? null;
        if (!source_receipt_hash) {
          throw new Error("replacement_source_receipt_missing");
        }
      }

      const input_hash = computeCanonicalHash({
        artifact_key,
        byte_size: input.byte_size,
        canonicalization_version: CANONICALIZATION_VERSION,
        filename: input.filename,
        hash_algorithm: HASH_ALGORITHM,
        legacy_case_id: input.legacy_case_id,
        legacy_document_id: input.legacy_document_id,
        mime_type: input.mime_type,
        preservation_rule_version: PRESERVATION_RULE_VERSION,
        preservation_mode,
        replacement_reason: input.replacement_reason ?? null,
        replaces_legacy_document_id: input.replaces_legacy_document_id ?? null,
        sha256: input.sha256,
        snapshot_id: input.snapshot_id,
        storage_bucket: storage.storage_bucket,
        storage_object_path: storage.storage_object_path,
        source_receipt_hash,
        verification_scope,
      });

      const existing_layer = await client.query<LayerRunRow>(
        `select layer_run_id, input_hash, output_hash, receipt, receipt_hash,
              previous_receipt_hash, hash_algorithm, canonicalization_version
         from public.intake_layer_runs
        where intake_session_id = $1::uuid
          and layer_name = 'evidence_preservation'
          and layer_version = $2
          and input_hash = $3
          and is_sealed = true
          and run_status = 'completed'
          and completed_at is not null
        for update`,
        [spine.intake_session_id, PRESERVATION_LAYER_VERSION, input_hash],
      );

      const replay = existing_layer.rows[0];
      if (replay) {
        const stored_receipt = parse_json_object(replay.receipt);
        const stored_payload = Object.fromEntries(
          Object.entries(stored_receipt).filter(
            ([key]) => key !== "receipt_hash",
          ),
        );
        if (
          replay.hash_algorithm !== HASH_ALGORITHM ||
          replay.canonicalization_version !== CANONICALIZATION_VERSION ||
          computeCanonicalHash(stored_payload) !== replay.receipt_hash ||
          stored_receipt.input_hash !== replay.input_hash ||
          stored_receipt.output_hash !== replay.output_hash ||
          stored_receipt.previous_receipt_hash !== replay.previous_receipt_hash ||
          stored_receipt.receipt_hash !== replay.receipt_hash ||
          stored_receipt.artifact_id !== artifact.artifact_id ||
          Number(stored_receipt.legacy_document_id) !==
            input.legacy_document_id ||
          Number(stored_receipt.snapshot_id) !== input.snapshot_id ||
          stored_receipt.sha256 !== input.sha256 ||
          stored_receipt.preservation_mode !== preservation_mode ||
          stored_receipt.receipt_version !== "2.0.0" ||
          stored_receipt.verification_scope !== verification_scope ||
          stored_receipt.source_receipt_hash !== source_receipt_hash ||
          artifact.artifact_status !== "preserved"
        ) {
          throw new Error("sealed_preservation_receipt_conflict");
        }

        await finalize_replacement_projection(client, input);
        await update_open_snapshot_manifest(client, input, snapshot);
        await client.query(
          `update public.intake_sessions
            set completion_state = 'evidence_preserved', updated_at = now()
          where intake_session_id = $1::uuid`,
          [spine.intake_session_id],
        );

        return {
          ...spine,
          artifact_id: artifact.artifact_id,
          layer_run_id: replay.layer_run_id,
          verification_record_id: String(stored_receipt.verification_record_id),
          transition_id: String(stored_receipt.transition_id),
          legacy_document_id: input.legacy_document_id,
          snapshot_id: input.snapshot_id,
          sha256: input.sha256,
          storage_bucket: storage.storage_bucket,
          storage_object_path: storage.storage_object_path,
          input_hash: replay.input_hash,
          output_hash: replay.output_hash,
          receipt_hash: replay.receipt_hash,
          previous_receipt_hash: replay.previous_receipt_hash,
          hash_algorithm: HASH_ALGORITHM,
          canonicalization_version: CANONICALIZATION_VERSION,
          preservation_state: "preserved",
          verification_scope,
          source_receipt_hash,
          replayed: true,
        };
      }

      const output_hash = computeCanonicalHash({
        artifact_key,
        byte_size: input.byte_size,
        legacy_document_id: input.legacy_document_id,
        preservation_mode,
        preservation_state: "preserved",
        replacement_reason: input.replacement_reason ?? null,
        replaces_legacy_document_id: input.replaces_legacy_document_id ?? null,
        sha256: input.sha256,
        snapshot_id: input.snapshot_id,
        storage_bucket: storage.storage_bucket,
        storage_object_path: storage.storage_object_path,
        source_receipt_hash,
        verification_scope,
      });
      const previous = await client.query<{
        receipt_hash: string;
        canonicalization_version: string;
      }>(
        `select receipt_hash, canonicalization_version
         from public.intake_layer_runs
        where intake_session_id = $1::uuid
          and is_sealed = true
          and receipt_hash is not null
        order by sealed_at desc, layer_run_id desc
        limit 1`,
        [spine.intake_session_id],
      );
      const previous_receipt_hash = previous.rows[0]?.receipt_hash ?? null;
      const previous_canonicalization_version =
        previous.rows[0]?.canonicalization_version ?? null;
      const layer_run_id = deterministic_uuid(
        `lighthouse:evidence-preservation:${spine.intake_session_id}:${input_hash}`,
      );
      const verification_record_id = deterministic_uuid(
        `lighthouse:artifact-preservation-scope:${spine.intake_session_id}:${input_hash}`,
      );
      const transition_id = deterministic_uuid(
        `lighthouse:artifact-preserved:${spine.intake_session_id}:${input_hash}`,
      );
      const receipt_payload = {
        artifact_id: artifact.artifact_id,
        artifact_key,
        byte_size: String(input.byte_size),
        canonicalization_version: CANONICALIZATION_VERSION,
        case_uuid: spine.case_uuid,
        filename: input.filename,
        hash_algorithm: HASH_ALGORITHM,
        input_hash,
        intake_session_id: spine.intake_session_id,
        layer_name: "evidence_preservation",
        layer_run_id,
        layer_version: PRESERVATION_LAYER_VERSION,
        legacy_case_id: String(input.legacy_case_id),
        legacy_document_id: String(input.legacy_document_id),
        mime_type: input.mime_type,
        output_hash,
        previous_canonicalization_version,
        previous_receipt_hash,
        preservation_mode,
        preservation_state: "preserved",
        receipt_type:
          preservation_mode === "existing_receipted_document"
            ? "document_replacement"
            : "evidence_preservation",
        receipt_version: "2.0.0",
        replacement_reason: input.replacement_reason ?? null,
        replaces_legacy_document_id: input.replaces_legacy_document_id
          ? String(input.replaces_legacy_document_id)
          : null,
        rule_version: PRESERVATION_RULE_VERSION,
        sha256: input.sha256,
        snapshot_id: String(input.snapshot_id),
        source_receipt_hash,
        storage_bucket: storage.storage_bucket,
        storage_object_path: storage.storage_object_path,
        transition_id,
        verification_record_id,
        verification_scope,
      } as const;
      const receipt_hash = computeCanonicalHash(receipt_payload);
      const receipt = {
        ...receipt_payload,
        receipt_hash,
      } as const;

      await client.query(
        `insert into public.intake_layer_runs (
         layer_run_id, intake_session_id, layer_name, layer_version,
         rule_version, normalization_version, run_status,
         input_hash, output_hash, input_refs, output_refs,
         unresolved_dependencies, receipt, receipt_hash, previous_receipt_hash,
         hash_algorithm, canonicalization_version,
         started_at, completed_at, is_sealed, sealed_at
       ) values (
         $1::uuid, $2::uuid, 'evidence_preservation', $3,
         $4, $5, 'completed',
         $6, $7, $8::jsonb, $9::jsonb,
         '[]'::jsonb, $10::jsonb, $11, $12,
         $13, $14,
         now(), now(), true, now()
       )`,
        [
          layer_run_id,
          spine.intake_session_id,
          PRESERVATION_LAYER_VERSION,
          PRESERVATION_RULE_VERSION,
          CANONICALIZATION_VERSION,
          input_hash,
          output_hash,
          JSON.stringify([
            { artifact_id: artifact.artifact_id, sha256: input.sha256 },
          ]),
          JSON.stringify([
            {
              artifact_id: artifact.artifact_id,
              preservation_state: "preserved",
              receipt_hash,
            },
          ]),
          JSON.stringify(receipt),
          receipt_hash,
          previous_receipt_hash,
          HASH_ALGORITHM,
          CANONICALIZATION_VERSION,
        ],
      );

      await client.query(
        `insert into public.intake_verification_records (
         verification_record_id, intake_session_id, target_type, target_key,
         assertion_text, verification_state, source_refs, contradiction_refs,
         rule_version
       ) values (
         $1::uuid, $2::uuid, 'artifact_preservation_receipt', $3,
         $4, 'supported_by_one_source', $5::jsonb, '[]'::jsonb, $6
       )`,
        [
          verification_record_id,
          spine.intake_session_id,
          artifact_key,
          preservation_mode === "existing_receipted_document"
            ? "A prior immutable preservation receipt identifies these document bytes, and the configured storage adapter confirmed the same hash-bound object path was addressable for this replacement link. Stored bytes and document contents were not independently reverified in this step."
            : "The upload request bytes produced the recorded SHA-256 value, and the configured storage adapter confirmed the hash-bound object path was addressable. Stored bytes and document contents were not independently verified in this step.",
          JSON.stringify([
            {
              artifact_id: artifact.artifact_id,
              content_truth_verified: false,
              receipt_hash,
              sha256: input.sha256,
              source_receipt_hash,
              storage_bytes_rehashed: false,
              verification_scope,
            },
          ]),
          PRESERVATION_RULE_VERSION,
        ],
      );

      await client.query(
        `insert into public.intake_state_transitions (
         transition_id, intake_session_id, target_type, target_key,
         transition_type, from_state, to_state, reason,
         source_layer_run_id, source_artifact_id
       ) values (
         $1::uuid, $2::uuid, 'artifact', $3,
         $4, $5::jsonb, $6::jsonb, $7,
         $8::uuid, $9::uuid
       )`,
        [
          transition_id,
          spine.intake_session_id,
          artifact_key,
          preservation_mode === "existing_receipted_document"
            ? "link_replacement"
            : "preserve",
          JSON.stringify({ artifact_status: artifact.artifact_status }),
          JSON.stringify({
            artifact_status: "preserved",
            receipt_hash,
            replaces_legacy_document_id:
              input.replaces_legacy_document_id ?? null,
          }),
          preservation_mode === "existing_receipted_document"
            ? "A receipt-backed existing document was linked as the replacement within the same open snapshot."
            : "Hash-bound object addressability and an immutable preservation receipt were recorded.",
          layer_run_id,
          artifact.artifact_id,
        ],
      );

      if (preservation_mode === "uploaded_bytes") {
        await client.query(
          `update public.intake_artifacts
            set artifact_status = 'preserved',
                availability = $1,
                metadata = metadata || $2::jsonb,
                updated_at = now()
          where artifact_id = $3::uuid`,
          [
            storage.storage_bucket
              ? "private_object_addressable"
              : "stored_object_addressable",
            JSON.stringify({
              legacy_document_id: input.legacy_document_id,
              preservation_receipt_hash: receipt_hash,
            }),
            artifact.artifact_id,
          ],
        );
      }

      await finalize_replacement_projection(client, input);
      await update_open_snapshot_manifest(client, input, snapshot);
      await client.query(
        `update public.intake_sessions
          set completion_state = 'evidence_preserved', updated_at = now()
        where intake_session_id = $1::uuid`,
        [spine.intake_session_id],
      );

      return {
        ...spine,
        artifact_id: artifact.artifact_id,
        layer_run_id,
        verification_record_id,
        transition_id,
        legacy_document_id: input.legacy_document_id,
        snapshot_id: input.snapshot_id,
        sha256: input.sha256,
        storage_bucket: storage.storage_bucket,
        storage_object_path: storage.storage_object_path,
        input_hash,
        output_hash,
        receipt_hash,
        previous_receipt_hash,
        hash_algorithm: HASH_ALGORITHM,
        canonicalization_version: CANONICALIZATION_VERSION,
        preservation_state: "preserved",
        verification_scope,
        source_receipt_hash,
        replayed: false,
      };
    });

  try {
    return await run_preservation();
  } catch (error) {
    if (!isIntakeTransactionCommitUncertainError(error)) throw error;
    // The immutable input hash makes this retry either an exact sealed replay
    // or the first durable insert if the original COMMIT did not land.
    return run_preservation();
  }
}

export const resolveCaseIntakeSpine = resolve_case_intake_spine;
export const createCaseWithIntakeSpine = create_case_with_intake_spine;
export const registerDocumentUploadIntent = register_document_upload_intent;
export const quarantineDocumentUploadIntent = quarantine_document_upload_intent;
export const preserveDocumentInIntakeSpine = preserve_document_in_intake_spine;

export const intake_spine_testing = {
  canonicalization_version: CANONICALIZATION_VERSION,
  canonicalize: canonicalSerialize,
  deterministic_uuid,
  parse_storage_key,
};
