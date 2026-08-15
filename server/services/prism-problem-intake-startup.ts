import { runPrismProblemHandoffBatch } from "./prism-problem-intake-worker";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 30_000;
const INITIAL_DRAIN_PASSES = 4;
let sweepInProgress = false;
let timer: NodeJS.Timeout | null = null;

function configuredIntervalMs(): number {
  const raw = Number(process.env.PRISM_PROBLEM_HANDOFF_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MS;
  return Math.max(Math.trunc(raw), MIN_INTERVAL_MS);
}

async function sweep(label: string) {
  if (sweepInProgress) return { skipped: "already_running" as const };
  sweepInProgress = true;
  try {
    const result = await runPrismProblemHandoffBatch();
    console.log("[PrismProblemHandoff] sweep", { label, ...result });
    return result;
  } finally {
    sweepInProgress = false;
  }
}

export async function run_prism_problem_handoff_from_environment() {
  if (process.env.PRISM_PROBLEM_HANDOFF_ENABLED === "0") {
    console.log("[PrismProblemHandoff] disabled by environment");
    return { enabled: false, reason: "environment_disabled" as const };
  }
  if (!process.env.PRISM_BRIDGE_SECRET) {
    console.warn("[PrismProblemHandoff] disabled: PRISM_BRIDGE_SECRET not configured");
    return { enabled: false, reason: "prism_bridge_secret_unconfigured" as const };
  }
  if (!process.env.DATABASE_URL) {
    console.warn("[PrismProblemHandoff] disabled: DATABASE_URL not configured");
    return { enabled: false, reason: "database_unconfigured" as const };
  }

  for (let pass = 1; pass <= INITIAL_DRAIN_PASSES; pass += 1) {
    const result = await sweep(`startup-${pass}`);
    if ("attempted" in result && !result.remaining_may_exist) break;
  }

  const intervalMs = configuredIntervalMs();
  if (!timer) {
    timer = setInterval(() => {
      void sweep("interval").catch((error) => {
        console.error("[PrismProblemHandoff] interval sweep failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message : "unknown",
        });
      });
    }, intervalMs);
    timer.unref();
  }

  console.log("[PrismProblemHandoff] automatic sweep active", { interval_ms: intervalMs });
  return { enabled: true, interval_ms: intervalMs };
}
