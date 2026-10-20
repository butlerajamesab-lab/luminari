import { getPool, query_with_diagnostics } from "./db";
import { get_current_rosetta_live_detail } from "./current-law-rosetta-live";
import {
  require_v12_admission_for_binding,
  type v12_admission_receipt,
} from "./civic-genome-rosetta-v12-admission";
import { background_feature_enabled } from "./runtime-role";
import { is_genome_rosetta_publication_quarantined } from "./civic-genome-rosetta-publication-quarantine";

const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 300_000;
let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

type target_identity = {
  contract: "rosetta-rule-live-detail-v1";
  engine_version: string;
  rule_set_version: string;
  rule_manifest_hash: string;
  validation_test_name: string;
  promoted_at: string;
};

/**
 * Proposed Lighthouse target mapping, NOT an assertion that the missing
 * fields are currently present in Rosetta's published live-detail response.
 *
 * engine_version       <- target.engine_version (must be explicitly attested)
 * rule_set_version     <- target.ruleset_version
 * rule_manifest_hash   <- target.ruleset_sha256
 * promoted_at          <- target.selected_at (selection-time ordering proposal)
 * validation_test_name <- target.validation_test_name (must be attested)
 *
 * There is no legitimate inferred engine_version or validation_test_name.
 * Rosetta currently exposes ruleset identity, but those additional values
 * are not verified here. Missing fields block target synchronization.
 */
export function map_v12_live_target_for_genome(
  target: Record<string, unknown>,
  receipt: v12_admission_receipt,
): target_identity {
  const engine_version = target.engine_version;
  const rule_set_version = target.ruleset_version;
  const rule_manifest_hash = target.ruleset_sha256;
  const validation_test_name = target.validation_test_name;
  const promoted_at = target.selected_at;
  if (
    receipt.admitted !== true
    || !receipt.certification_sha256
    || typeof engine_version !== "string" || !engine_version.trim()
    || typeof rule_set_version !== "string" || !rule_set_version.trim()
    || typeof rule_manifest_hash !== "string" || !/^[a-f0-9]{64}$/i.test(rule_manifest_hash)
    || typeof validation_test_name !== "string" || !validation_test_name.trim()
    || typeof promoted_at !== "string" || !Number.isFinite(Date.parse(promoted_at))
    || receipt.ruleset_version !== rule_set_version
    || receipt.ruleset_sha256 !== rule_manifest_hash.toLowerCase()
    || receipt.selected_at !== promoted_at
  ) {
    throw new Error("rosetta_v12_generation_target_identity_unattested");
  }
  return {
    contract: "rosetta-rule-live-detail-v1",
    engine_version,
    rule_set_version,
    rule_manifest_hash: rule_manifest_hash.toLowerCase(),
    validation_test_name,
    promoted_at,
  };
}

function enabled(): boolean {
  return !is_genome_rosetta_publication_quarantined()
    && background_feature_enabled("ROSETTA_GENOME_TARGET_SYNC_ENABLED");
}

function interval_ms(): number {
  const parsed = Number.parseInt(process.env.ROSETTA_GENOME_TARGET_SYNC_MS ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, parsed));
}

export async function sync_rosetta_generation_target_once(): Promise<void> {
  if (is_genome_rosetta_publication_quarantined()) return;
  if (running || stopped) return;
  running = true;
  try {
    // No arbitrary "latest" source can establish the global target identity.
    // An explicitly selected Genome bill version is required for the future
    // independently approved target-sync run.
    const bill_version_id = process.env.ROSETTA_GENOME_TARGET_SOURCE_BILL_VERSION_ID?.trim();
    if (!bill_version_id || !/^[0-9a-f-]{36}$/i.test(bill_version_id)) {
      throw new Error("rosetta_v12_generation_target_binding_missing");
    }
    const { rows } = await getPool().query<{
      source_document_key: string | null;
      source_document_id: number | null;
      source_content_hash: string | null;
      source_content_id: string | null;
    }>(
      `select source_document_key,
              rosetta_source_document_id::integer as source_document_id,
              receipt_json->>'source_content_hash' as source_content_hash,
              receipt_json->>'rosetta_source_content_id' as source_content_id
         from public.civic_genome_bill_version
        where bill_version_id=$1::uuid
        limit 2`,
      [bill_version_id],
    );
    const source = rows[0];
    if (rows.length !== 1 || !source?.source_document_key || !source.source_document_id
      || !source.source_content_hash || !source.source_content_id) {
      throw new Error("rosetta_v12_generation_target_binding_missing");
    }
    const admission = await require_v12_admission_for_binding({
      bill_version_id,
      source_document_key: source.source_document_key,
      rosetta_source_document_id: source.source_document_id,
      source_content_hash: source.source_content_hash,
      rosetta_source_content_id: source.source_content_id,
    });
    const detail = await get_current_rosetta_live_detail({
      source_content_id: source.source_content_id,
      source_content_hash: source.source_content_hash,
    });
    if (!detail) throw new Error("rosetta_v12_generation_target_live_detail_missing");
    const target = map_v12_live_target_for_genome(detail.target, admission.receipt);

    // Unreachable while quarantine stays return true and certification is absent.
    await query_with_diagnostics(
      "select public.civic_genome_observe_rosetta_generation_target_v1($1,$2,$3,$4,$5,$6::timestamptz) as receipt",
      [
        target.contract,
        target.engine_version,
        target.rule_set_version,
        target.rule_manifest_hash,
        target.validation_test_name,
        target.promoted_at,
      ],
      {
        label: "rosetta_v12_generation_target_sync",
        pool_acquire_timeout_ms: 1_000,
        query_timeout_ms: 5_000,
      },
    );
  } catch (error) {
    console.error("[RosettaGenerationTarget] sync_failed", {
      error_class: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
    });
  } finally {
    running = false;
  }
}

export function start_rosetta_generation_target_sync(): void {
  if (timer || !enabled()) return;
  stopped = false;
  const delay = interval_ms();
  console.log("[RosettaGenerationTarget] started", { interval_ms: delay });
  void sync_rosetta_generation_target_once();
  timer = setInterval(() => void sync_rosetta_generation_target_once(), delay);
  timer.unref?.();
}

export function stop_rosetta_generation_target_sync(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}
