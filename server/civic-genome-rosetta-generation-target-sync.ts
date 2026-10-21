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
  read_contract_sha256: string;
  promoted_at: string;
};

/**
 * Verified current_target_v1 mapping (no separate V-series engine version):
 *   engine_version      <- target.ruleset_version
 *   rule_set_version    <- target.ruleset_version
 *   rule_manifest_hash  <- target.ruleset_sha256
 *   promoted_at         <- target.selected_at
 *   read_contract_sha256 <- target.read_contract_sha256
 *
 * Three selected-runtime identity flags MUST be true and the installed ruleset
 * SHA-256 MUST equal the selected ruleset SHA-256. There is no source for
 * validation_test_name; the legacy six-argument SQL observer must not be used.
 */
export function map_v12_live_target_for_genome(
  target: Record<string, unknown>,
  receipt: v12_admission_receipt,
): target_identity {
  const rule_set_version = target.ruleset_version;
  const rule_manifest_hash = target.ruleset_sha256;
  const installed_ruleset_sha256 = target.installed_ruleset_sha256;
  const read_contract_sha256 = target.read_contract_sha256;
  const promoted_at = target.selected_at;
  if (
    receipt.admitted !== true
    || !/^[a-f0-9]{64}$/i.test(receipt.certification_sha256 ?? "")
    || target.identity_valid !== true
    || target.engine_identity_valid !== true
    || target.read_identity_valid !== true
    || typeof rule_set_version !== "string" || !rule_set_version.trim()
    || typeof rule_manifest_hash !== "string" || !/^[a-f0-9]{64}$/i.test(rule_manifest_hash)
    || typeof installed_ruleset_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(installed_ruleset_sha256)
    || installed_ruleset_sha256.toLowerCase() !== rule_manifest_hash.toLowerCase()
    || typeof read_contract_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(read_contract_sha256)
    || typeof promoted_at !== "string" || !Number.isFinite(Date.parse(promoted_at))
    || receipt.ruleset_version !== rule_set_version
    || receipt.ruleset_sha256 !== rule_manifest_hash.toLowerCase()
    || receipt.installed_ruleset_sha256 !== installed_ruleset_sha256.toLowerCase()
    || receipt.read_contract_sha256 !== read_contract_sha256.toLowerCase()
    || receipt.selected_at !== promoted_at
  ) {
    throw new Error("rosetta_v12_generation_target_identity_unattested");
  }
  return {
    contract: "rosetta-rule-live-detail-v1",
    engine_version: rule_set_version,
    rule_set_version,
    rule_manifest_hash: rule_manifest_hash.toLowerCase(),
    read_contract_sha256: read_contract_sha256.toLowerCase(),
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
      // PROPOSED V12-only observer; not installed while quarantine is closed.
      // The old observer requires a nonexistent validation_test_name and is forbidden.
      "select public.civic_genome_observe_rosetta_generation_target_v12($1,$2,$3,$4,$5,$6::timestamptz) as receipt",
      [
        target.contract,
        target.engine_version,
        target.rule_set_version,
        target.rule_manifest_hash,
        target.read_contract_sha256,
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
