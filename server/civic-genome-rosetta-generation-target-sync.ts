import { query_with_diagnostics } from "./db";
import { fetch_rosetta_current_generation } from "./civic-genome-rosetta-generation-upgrade-worker";

const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 300_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

function enabled(): boolean {
  const configured = process.env.ROSETTA_GENOME_TARGET_SYNC_ENABLED?.trim().toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

function interval_ms(): number {
  const parsed = Number.parseInt(process.env.ROSETTA_GENOME_TARGET_SYNC_MS ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, parsed));
}

export async function sync_rosetta_generation_target_once(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    const generation = await fetch_rosetta_current_generation();
    await query_with_diagnostics(
      "select public.civic_genome_observe_rosetta_generation_target_v1($1,$2,$3,$4) as receipt",
      [generation.contract, generation.engine_version, generation.rule_set_version, generation.rule_manifest_hash],
      {
        label: "rosetta_generation_target_sync",
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
