import { produce_civic_genome_family_snapshot_v1 } from "./civic-genome-external-snapshot-producer";
import { deliver_civic_genome_snapshot_to_kaleidoscope_v1 } from "./civic-genome-kaleidoscope-handoff";

const FAMILY_ENV = "CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_FAMILY_ID";
const AS_OF_ENV = "CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_AS_OF";
const URL_ENV = "KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_URL";
const KEY_ID_ENV = "KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_KEY_ID";
const SECRET_ENV = "KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_SECRET";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDOFF_RETRY_DELAYS_MS = [0, 5_000, 20_000] as const;

export type civic_genome_kaleidoscope_handoff_configuration_v1 = {
  family_id: string;
  as_of: string;
  url: string;
  key_id: string;
  secret: string;
};

type civic_genome_kaleidoscope_handoff_run = {
  key: string;
  run: Promise<void>;
};

let civic_genome_kaleidoscope_handoff_in_flight: civic_genome_kaleidoscope_handoff_run | null = null;
let civic_genome_kaleidoscope_handoff_completed_key: string | null = null;

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

function civic_genome_kaleidoscope_handoff_configuration_key(
  configuration: civic_genome_kaleidoscope_handoff_configuration_v1,
): string {
  return [
    configuration.family_id,
    configuration.as_of,
    configuration.url,
    configuration.key_id,
  ].join("|");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function handoff_error_class(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

function handoff_error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "unknown");
}

function is_retryable_kaleidoscope_handoff_error(error: unknown): boolean {
  const message = handoff_error_message(error);
  return message.includes("receiver_http_502")
    || message.includes("receiver_http_503")
    || message.includes("receiver_http_504")
    || message.includes("AbortError")
    || message.includes("TimeoutError")
    || message.includes("fetch failed");
}

async function deliver_civic_genome_snapshot_to_kaleidoscope_with_bounded_retry(
  options: Parameters<typeof deliver_civic_genome_snapshot_to_kaleidoscope_v1>[0],
): ReturnType<typeof deliver_civic_genome_snapshot_to_kaleidoscope_v1> {
  let last_error: unknown = null;
  for (let attempt_index = 0; attempt_index < HANDOFF_RETRY_DELAYS_MS.length; attempt_index++) {
    const retry_delay_ms = HANDOFF_RETRY_DELAYS_MS[attempt_index];
    if (retry_delay_ms > 0) await sleep(retry_delay_ms);

    try {
      return await deliver_civic_genome_snapshot_to_kaleidoscope_v1(options);
    } catch (error) {
      last_error = error;
      const can_retry = is_retryable_kaleidoscope_handoff_error(error)
        && attempt_index < HANDOFF_RETRY_DELAYS_MS.length - 1;
      if (!can_retry) throw error;
      console.warn("[CivicGenomeKaleidoscopeHandoff] transient delivery failure, retrying", {
        attempt: attempt_index + 1,
        max_attempts: HANDOFF_RETRY_DELAYS_MS.length,
        next_retry_delay_ms: HANDOFF_RETRY_DELAYS_MS[attempt_index + 1],
        error_class: handoff_error_class(error),
        error_message: handoff_error_message(error),
      });
    }
  }
  throw last_error instanceof Error
    ? last_error
    : new Error("civic_genome_kaleidoscope_handoff_retry_exhausted");
}

/**
 * Optional bounded authenticated handoff.
 *
 * Normal deployments leave the family/as-of pair empty. When configured,
 * Lighthouse builds one immutable family snapshot through the established
 * repeatable-read read-only producer and sends it to Kaleidoscope for
 * authenticated validation and declared-rule verification mapping. A bounded
 * complete snapshot may receive an accepted binding and, when Kaleidoscope's
 * independently governed persistence gate is ready, durable snapshot storage.
 * Canonical projection execution remains forbidden by this handoff contract.
 * Neither the snapshot payload nor the shared secret is logged.
 */
export async function run_civic_genome_kaleidoscope_handoff_from_environment(): Promise<void> {
  const configuration = civic_genome_kaleidoscope_handoff_configuration_from_environment();
  if (!configuration) return;
  const configuration_key = civic_genome_kaleidoscope_handoff_configuration_key(configuration);
  if (civic_genome_kaleidoscope_handoff_completed_key === configuration_key) {
    console.log("[CivicGenomeKaleidoscopeHandoff] skipped already-completed startup handoff", {
      family_id: configuration.family_id,
      as_of: configuration.as_of,
      target_origin: new URL(configuration.url).origin,
      key_id: configuration.key_id,
    });
    return;
  }
  if (civic_genome_kaleidoscope_handoff_in_flight?.key === configuration_key) {
    console.log("[CivicGenomeKaleidoscopeHandoff] joined in-flight startup handoff", {
      family_id: configuration.family_id,
      as_of: configuration.as_of,
      target_origin: new URL(configuration.url).origin,
      key_id: configuration.key_id,
    });
    return civic_genome_kaleidoscope_handoff_in_flight.run;
  }

  const run = run_civic_genome_kaleidoscope_handoff_once(configuration).then(() => {
    civic_genome_kaleidoscope_handoff_completed_key = configuration_key;
  }).finally(() => {
    if (civic_genome_kaleidoscope_handoff_in_flight?.run === run) {
      civic_genome_kaleidoscope_handoff_in_flight = null;
    }
  });
  civic_genome_kaleidoscope_handoff_in_flight = { key: configuration_key, run };
  return run;
}

async function run_civic_genome_kaleidoscope_handoff_once(
  configuration: civic_genome_kaleidoscope_handoff_configuration_v1,
): Promise<void> {
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
  const receipt = await deliver_civic_genome_snapshot_to_kaleidoscope_with_bounded_retry({
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
    persistence_state: receipt.persistence_state,
    persisted: receipt.persisted,
    target_schema: receipt.target_schema,
    source_binding_id: receipt.source_binding_id,
    state_snapshot_id: receipt.state_snapshot_id,
    state_component_count: receipt.state_component_count,
    source_artifact_count: receipt.source_artifact_count,
    database_write_count: receipt.database_write_count,
    idempotent_reuse: receipt.idempotent_reuse,
    persistence_errors: receipt.persistence_errors,
    projection_executed: receipt.projection_executed,
  });
}
