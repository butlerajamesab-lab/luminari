import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { getPool } from "./db";

const BINDING_VERSION = "lighthouse_intake_upload_binding.v1.0.0";
const ADVISORY_LOCK_NAMESPACE = 76004001;

export type uploaded_evidence_binding_input = {
  legacy_case_id: number;
  owner_user_id: number;
  snapshot_id: number;
  document_id: number;
  filename: string;
  file_type: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  storage_key: string;
};

export type uploaded_evidence_binding_result = {
  case_uuid: string;
  intake_session_id: string;
  artifact_id: string;
  snapshot_id: number;
  document_id: number;
};

export function build_live_upload_source_fingerprint(
  case_uuid: string,
  owner_user_id: number,
): string {
  return createHash("sha256")
    .update(`${BINDING_VERSION}|${case_uuid}|${owner_user_id}`)
    .digest("hex");
}

export function build_intake_artifact_key(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("intake_upload_binding_invalid_sha256");
  }
  return `sha256:${sha256}`;
}

function parse_document_ids(raw_value: unknown): number[] {
  if (typeof raw_value !== "string" || raw_value.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw_value);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(
      parsed
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0),
    )).sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function parse_document_hashes(raw_value: unknown): Record<string, string> {
  if (typeof raw_value !== "string" || raw_value.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw_value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && /^[0-9a-f]{64}$/.test(value)) {
        output[key] = value;
      }
    }
    return output;
  } catch {
    return {};
  }
}

function split_storage_key(storage_key: string): {
  storage_bucket: string | null;
  storage_object_path: string | null;
} {
  const supabase_match = storage_key.match(/^supabase:\/\/([^/]+)\/(.+)$/);
  if (supabase_match) {
    return {
      storage_bucket: supabase_match[1],
      storage_object_path: supabase_match[2],
    };
  }
  return {
    storage_bucket: null,
    storage_object_path: storage_key || null,
  };
}

async function ensure_live_upload_session(
  client: PoolClient,
  legacy_case_id: number,
  owner_user_id: number,
): Promise<{ case_uuid: string; intake_session_id: string }> {
  await client.query("select pg_advisory_xact_lock($1, $2)", [
    ADVISORY_LOCK_NAMESPACE,
    legacy_case_id,
  ]);

  const bridge_result = await client.query<{ case_uuid: string }>(
    `select case_uuid::text as case_uuid
       from public.case_identity_bridge
      where legacy_case_id = $1
      limit 1`,
    [legacy_case_id],
  );
  const case_uuid = bridge_result.rows[0]?.case_uuid;
  if (!case_uuid) throw new Error("intake_upload_binding_case_identity_missing");

  const source_fingerprint = build_live_upload_source_fingerprint(
    case_uuid,
    owner_user_id,
  );

  const existing_session = await client.query<{ intake_session_id: string }>(
    `select intake_session_id::text as intake_session_id
       from public.intake_sessions
      where owner_user_id = $1
        and session_type = 'live'
        and entry_channel = 'upload'
        and source_fingerprint = $2
      order by created_at
      limit 1`,
    [owner_user_id, source_fingerprint],
  );

  let intake_session_id = existing_session.rows[0]?.intake_session_id;
  if (!intake_session_id) {
    const inserted = await client.query<{ intake_session_id: string }>(
      `insert into public.intake_sessions (
         intake_session_id,
         owner_user_id,
         session_type,
         entry_channel,
         source_label,
         privacy_mode,
         session_status,
         completion_state,
         source_fingerprint,
         metadata,
         created_at,
         updated_at
       ) values (
         gen_random_uuid(),
         $1,
         'live',
         'upload',
         'lighthouse_case_upload',
         'private',
         'open',
         'evidence_registered',
         $2,
         jsonb_build_object(
           'binding_version', $3::text,
           'legacy_case_id', $4::integer,
           'case_uuid', $5::text
         ),
         now(),
         now()
       )
       returning intake_session_id::text as intake_session_id`,
      [owner_user_id, source_fingerprint, BINDING_VERSION, legacy_case_id, case_uuid],
    );
    intake_session_id = inserted.rows[0]?.intake_session_id;
  }
  if (!intake_session_id) throw new Error("intake_upload_binding_session_create_failed");

  await client.query(
    `insert into public.case_intake_links (
       case_intake_link_id,
       intake_session_id,
       case_uuid,
       link_type,
       is_primary,
       metadata,
       created_at
     ) values (
       gen_random_uuid(),
       $1::uuid,
       $2::uuid,
       'related',
       false,
       jsonb_build_object('binding_version', $3::text, 'legacy_case_id', $4::integer),
       now()
     )
     on conflict (intake_session_id, case_uuid) do nothing`,
    [intake_session_id, case_uuid, BINDING_VERSION, legacy_case_id],
  );

  return { case_uuid, intake_session_id };
}

async function bind_snapshot_membership(
  client: PoolClient,
  input: uploaded_evidence_binding_input,
): Promise<void> {
  const snapshot_result = await client.query<{
    snapshot_status: string | null;
    document_ids: string | null;
    document_hashes: string | null;
  }>(
    `select snapshot_status, document_ids, document_hashes
       from public.corpus_snapshots
      where id = $1 and case_id = $2
      for update`,
    [input.snapshot_id, input.legacy_case_id],
  );
  const snapshot = snapshot_result.rows[0];
  if (!snapshot) throw new Error("intake_upload_binding_snapshot_missing");
  if (snapshot.snapshot_status !== "open") {
    throw new Error("intake_upload_binding_snapshot_not_open");
  }

  const document_ids = parse_document_ids(snapshot.document_ids);
  if (!document_ids.includes(input.document_id)) {
    document_ids.push(input.document_id);
    document_ids.sort((left, right) => left - right);
  }

  const document_hashes = parse_document_hashes(snapshot.document_hashes);
  document_hashes[String(input.document_id)] = input.sha256;

  await client.query(
    `update public.corpus_snapshots
        set document_ids = $2,
            document_hashes = $3
      where id = $1`,
    [
      input.snapshot_id,
      JSON.stringify(document_ids),
      JSON.stringify(document_hashes),
    ],
  );
}

export async function bind_uploaded_evidence_to_intake_spine(
  input: uploaded_evidence_binding_input,
): Promise<uploaded_evidence_binding_result> {
  if (!Number.isInteger(input.legacy_case_id) || input.legacy_case_id <= 0) {
    throw new Error("intake_upload_binding_invalid_case_id");
  }
  if (!Number.isInteger(input.document_id) || input.document_id <= 0) {
    throw new Error("intake_upload_binding_invalid_document_id");
  }
  if (!Number.isInteger(input.snapshot_id) || input.snapshot_id <= 0) {
    throw new Error("intake_upload_binding_invalid_snapshot_id");
  }
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
    throw new Error("intake_upload_binding_invalid_sha256");
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");

    const { case_uuid, intake_session_id } = await ensure_live_upload_session(
      client,
      input.legacy_case_id,
      input.owner_user_id,
    );

    await bind_snapshot_membership(client, input);

    const artifact_key = build_intake_artifact_key(input.sha256);
    const storage_location = split_storage_key(input.storage_key);

    const existing_artifact = await client.query<{ artifact_id: string }>(
      `select artifact_id::text as artifact_id
         from public.intake_artifacts
        where intake_session_id = $1::uuid
          and artifact_key = $2
        limit 1`,
      [intake_session_id, artifact_key],
    );

    let artifact_id = existing_artifact.rows[0]?.artifact_id;
    if (!artifact_id) {
      const inserted_artifact = await client.query<{ artifact_id: string }>(
        `insert into public.intake_artifacts (
           artifact_id,
           intake_session_id,
           artifact_key,
           source_family,
           artifact_type,
           evidence_tier,
           availability,
           filename,
           mime_type,
           byte_size,
           sha256,
           storage_bucket,
           storage_object_path,
           privacy_classification,
           artifact_status,
           metadata,
           created_at,
           updated_at
         ) values (
           gen_random_uuid(),
           $1::uuid,
           $2,
           'lighthouse_case_evidence',
           'source_document',
           'primary_source_upload',
           'lighthouse_private_storage',
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           'private',
           'registered',
           jsonb_build_object(
             'binding_version', $9::text,
             'legacy_case_id', $10::integer,
             'legacy_document_id', $11::integer,
             'snapshot_id', $12::integer,
             'declared_file_type', $13::text,
             'storage_key', $14::text
           ),
           now(),
           now()
         )
         returning artifact_id::text as artifact_id`,
        [
          intake_session_id,
          artifact_key,
          input.filename,
          input.mime_type,
          input.byte_size,
          input.sha256,
          storage_location.storage_bucket,
          storage_location.storage_object_path,
          BINDING_VERSION,
          input.legacy_case_id,
          input.document_id,
          input.snapshot_id,
          input.file_type,
          input.storage_key,
        ],
      );
      artifact_id = inserted_artifact.rows[0]?.artifact_id;
    }

    if (!artifact_id) throw new Error("intake_upload_binding_artifact_create_failed");

    await client.query(
      `update public.intake_sessions
          set completion_state = 'evidence_registered',
              updated_at = now()
        where intake_session_id = $1::uuid`,
      [intake_session_id],
    );

    await client.query("commit");
    return {
      case_uuid,
      intake_session_id,
      artifact_id,
      snapshot_id: input.snapshot_id,
      document_id: input.document_id,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
