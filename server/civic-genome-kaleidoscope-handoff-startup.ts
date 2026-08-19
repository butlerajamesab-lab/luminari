import { produce_civic_genome_family_snapshot_v1 } from "./civic-genome-external-snapshot-producer";
import { deliver_civic_genome_snapshot_to_kaleidoscope_v1 } from "./civic-genome-kaleidoscope-handoff";

const FAMILY_ENV = "CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_FAMILY_ID";
const AS_OF_ENV = "CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_AS_OF";
const URL_ENV = "KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_URL";
const KEY_ID_ENV = "KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_KEY_ID";
const SECRET_ENV = "KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_SECRET";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type civic_genome_kaleidoscope_handoff_configuration_v1 = {
  family_id: string;
  as_of: string;
  url: string;
  key_id: string;
  secret: string;
};

export function civic_genome_kaleidoscope_handoff_configuration_from_environment(
  environment: NodeJS.ProcessEnv = process.env,
): civic_genome_kaleidoscope_handoff_configuration_v1 | null {
  const family_id = environment[FAMILY_ENV]?.trim() ?? "";
  const as_of = environment[AS_OF_ENV]?.trim() ?? "";
  const url = environment[URL_ENV]?.trim() ?? "";
  const key_id = environment[KEY_ID_ENV]?.trim() ?? "";
  const secret = environment[SECRET_ENV]?.trim() ?? "";
  const values = [family_id, as_of, url, key_id, secret];
  if (values.every(value => value.length === 0)) return null;
  if (values.some(value => value.length === 0)) {
    throw new Error("civic_genome_kaleidoscope_handoff_requires_complete_configuration");
  }
  if (!UUID.test(family_id)) {
    throw new Error("invalid_civic_genome_kaleidoscope_handoff_family_id");
  }
  const parsed_as_of = new Date(as_of);
  if (!Number.isFinite(parsed_as_of.getTime())) {
    throw new Error("invalid_civic_genome_kaleidoscope_handoff_as_of");
  }
  const parsed_url = new URL(url);
  if (parsed_url.protocol !== "https:") {
    throw new Error("civic_genome_kaleidoscope_handoff_requires_https");
  }
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("civic_genome_kaleidoscope_handoff_secret_too_short");
  }
  return {
    family_id,
    as_of: parsed_as_of.toISOString(),
    url: parsed_url.toString(),
    key_id,
    secret,
  };
}

/**
 * Optional bounded authenticated handoff.
 *
 * Normal deployments leave the family/as-of pair empty. When configured,
 * Lighthouse builds one immutable family snapshot through the established
 * repeatable-read read-only producer and sends it to Kaleidoscope for
 * authenticated validation and declared-rule verification mapping. A bounded
 * complete snapshot may receive an accepted transient binding receipt, but the
 * receiver must still report no persistence and no projection execution.
 * Neither the snapshot payload nor the shared secret is logged.
 */
export async function run_civic_genome_kaleidoscope_handoff_from_environment(): Promise<void> {
  const configuration = civic_genome_kaleidoscope_handoff_configuration_from_environment();
  if (!configuration) return;

  const source_commit_sha = process.env.RENDER_GIT_COMMIT?.trim() || null;
  console.log("[CivicGenomeKaleidoscopeHandoff] started", {
    family_id: configuration.family_id,
    as_of: configuration.as_of,
    target_origin: new URL(configuration.url).origin,
    key_id: configuration.key_id,
  });

  const snapshot = await produce_civic_genome_family_snapshot_v1({
    family_id: configuration.family_id,
    as_of: configuration.as_of,
    source_commit_sha,
    generated_at: new Date().toISOString(),
  });
  const receipt = await deliver_civic_genome_snapshot_to_kaleidoscope_v1({
    snapshot,
    url: configuration.url,
    key_id: configuration.key_id,
    secret: configuration.secret,
  });

  console.log("[CivicGenomeKaleidoscopeHandoff] completed", {
    family_id: configuration.family_id,
    as_of: configuration.as_of,
    source_commit_sha,
    source_snapshot_id: receipt.source_snapshot_id,
    source_snapshot_hash: receipt.source_snapshot_hash,
    source_export_receipt_id: receipt.source_export_receipt_id,
    source_export_receipt_hash: receipt.source_export_receipt_hash,
    source_component_count: receipt.source_component_count,
    delivery_receipt_id: receipt.delivery_receipt_id,
    delivery_receipt_hash: receipt.delivery_receipt_hash,
    validation_state: receipt.validation_state,
    binding_id: receipt.binding_id,
    binding_hash: receipt.binding_hash,
    binding_state: receipt.binding_state,
    binding_errors: receipt.binding_errors,
    verification_mapping_state: receipt.verification_mapping_state,
    verification_mapping_rule_id: receipt.verification_mapping_rule_id,
    verification_mapping_rule_version: receipt.verification_mapping_rule_version,
    authenticated: receipt.authenticated,
    persisted: receipt.persisted,
    projection_executed: receipt.projection_executed,
    database_write_count: 0,
  });
}