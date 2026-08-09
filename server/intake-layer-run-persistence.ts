import { getPool } from "./db";

const SHA256_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type intake_layer_execution_persistence_input = {
  intake_session_id: string;
  execution_lease_token: string;
  layer_name: string;
  layer_version: string;
  rule_version: string;
  parser_version: string;
  rule_manifest_hash: string;
  execution_envelope: Record<string, unknown>;
  input_hash: string;
  output_data: unknown;
  output_hash: string;
  input_refs?: unknown[];
  unresolved_dependencies?: unknown[];
};

export type intake_layer_execution_persistence_result = {
  layer_run_id: string;
  receipt_hash: string;
  output_artifact_id: string;
  reused_existing: boolean;
};

function require_nonempty(value: string, field: string): void {
  if (!value.trim())
    throw new Error(`intake_layer_execution_${field}_required`);
}

function require_sha256(value: string, field: string): void {
  if (!SHA256_RE.test(value))
    throw new Error(`intake_layer_execution_${field}_invalid_sha256`);
}

function require_uuid(value: string, field: string): void {
  if (!UUID_RE.test(value))
    throw new Error(`intake_layer_execution_${field}_invalid_uuid`);
}

/**
 * Persist one deterministic Universal Intake Spine layer execution.
 *
 * This adapter intentionally exposes only the v4 registration contract. v4
 * fences the write with the active execution lease, then delegates to v3 to
 * re-canonicalize the execution envelope and output data inside PostgreSQL,
 * verify both hashes, and extend the sealed receipt chain. Runtime callers
 * must not bypass either proof by writing intake_layer_runs directly.
 */
export async function register_intake_layer_execution(
  input: intake_layer_execution_persistence_input,
): Promise<intake_layer_execution_persistence_result> {
  require_uuid(input.intake_session_id, "session_id");
  require_uuid(input.execution_lease_token, "execution_lease_token");
  require_nonempty(input.layer_name, "layer_name");
  require_nonempty(input.layer_version, "layer_version");
  require_nonempty(input.rule_version, "rule_version");
  require_nonempty(input.parser_version, "parser_version");
  require_sha256(input.rule_manifest_hash, "rule_manifest_hash");
  require_sha256(input.input_hash, "input_hash");
  require_sha256(input.output_hash, "output_hash");

  if (!input.execution_envelope || Array.isArray(input.execution_envelope)) {
    throw new Error("intake_layer_execution_execution_envelope_required");
  }

  const input_refs = input.input_refs ?? [];
  const unresolved_dependencies = input.unresolved_dependencies ?? [];
  if (!Array.isArray(input_refs))
    throw new Error("intake_layer_execution_input_refs_must_be_array");
  if (!Array.isArray(unresolved_dependencies)) {
    throw new Error(
      "intake_layer_execution_unresolved_dependencies_must_be_array",
    );
  }

  const result = await getPool().query<{
    registered_layer_run_id: string;
    registered_receipt_hash: string;
    registered_output_artifact_id: string;
    reused_existing: boolean;
  }>(
    `select
       registered_layer_run_id::text,
       registered_receipt_hash,
       registered_output_artifact_id::text,
       reused_existing
     from public.register_intake_layer_execution_v4(
       $1::uuid,
       $2::text,
       $3::text,
       $4::text,
       $5::text,
       $6::text,
       $7::jsonb,
       $8::text,
       $9::jsonb,
       $10::text,
       $11::jsonb,
       $12::jsonb,
       $13::uuid
     )`,
    [
      input.intake_session_id,
      input.layer_name,
      input.layer_version,
      input.rule_version,
      input.parser_version,
      input.rule_manifest_hash,
      input.execution_envelope,
      input.input_hash,
      input.output_data ?? null,
      input.output_hash,
      input_refs,
      unresolved_dependencies,
      input.execution_lease_token,
    ],
  );

  const row = result.rows[0];
  if (!row)
    throw new Error("intake_layer_execution_registration_returned_no_row");
  require_uuid(row.registered_layer_run_id, "registered_layer_run_id");
  require_uuid(
    row.registered_output_artifact_id,
    "registered_output_artifact_id",
  );
  require_sha256(row.registered_receipt_hash, "registered_receipt_hash");

  return {
    layer_run_id: row.registered_layer_run_id,
    receipt_hash: row.registered_receipt_hash,
    output_artifact_id: row.registered_output_artifact_id,
    reused_existing: Boolean(row.reused_existing),
  };
}
