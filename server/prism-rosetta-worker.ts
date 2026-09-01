import "dotenv/config";
import { getPool } from "./db";
import {
  start_prism_rosetta_queue_worker,
  stop_prism_rosetta_queue_worker,
} from "./services/prism-rosetta-queue-worker";
import {
  legislative_version_queue_recovery_contract_scope,
  start_legislative_version_queue_worker,
  stop_legislative_version_queue_worker,
} from "./civic-genome-legislative-version-queue-worker";
import {
  background_feature_enabled,
  resolve_lighthouse_runtime_role,
} from "./runtime-role";

const runtime_role = resolve_lighthouse_runtime_role();
if (runtime_role.role !== "worker" || !runtime_role.valid) {
  throw new Error("prism_worker_runtime_role_required");
}
if (!background_feature_enabled("PRISM_ROSETTA_QUEUE_ENABLED")) {
  throw new Error("prism_worker_feature_grant_required");
}
const canary_queue_id = process.env.PRISM_ROSETTA_QUEUE_CANARY_ID?.trim();
if (!canary_queue_id) {
  throw new Error("prism_worker_canary_queue_id_required");
}
const legislative_version_queue_requested = background_feature_enabled(
  "LEGISLATIVE_VERSION_QUEUE_ENABLED",
);
const legislative_version_queue_recovery_scope =
  legislative_version_queue_requested
    ? legislative_version_queue_recovery_contract_scope()
    : null;
if (
  legislative_version_queue_requested &&
  !legislative_version_queue_recovery_scope
) {
  throw new Error("prism_worker_legislative_recovery_scope_required");
}
const legiscan_api_key_configured = Boolean(
  process.env.LEGISCAN_API_KEY?.trim(),
);
const legislative_version_queue_enabled =
  legislative_version_queue_requested && legiscan_api_key_configured;
if (legislative_version_queue_requested && !legiscan_api_key_configured) {
  console.error(
    "[PrismRosettaWorker] legislative_queue_disabled_missing_legiscan_api_key",
  );
}

console.log("[PrismRosettaWorker] starting", {
  runtime_role: runtime_role.role,
  canary_queue_id,
  render_git_commit: process.env.RENDER_GIT_COMMIT ?? null,
  render_service_id: process.env.RENDER_SERVICE_ID ?? null,
  legislative_version_queue_requested,
  legislative_version_queue_enabled,
  legislative_version_queue_recovery_scope,
  legiscan_api_key_configured,
});
start_prism_rosetta_queue_worker();
if (legislative_version_queue_enabled) {
  start_legislative_version_queue_worker();
}

const keep_alive = setInterval(() => undefined, 60_000);

let shutting_down = false;
async function shutdown(signal: string): Promise<void> {
  if (shutting_down) return;
  shutting_down = true;
  console.log("[PrismRosettaWorker] shutdown_started", { signal });
  clearInterval(keep_alive);
  await Promise.all([
    stop_prism_rosetta_queue_worker(),
    legislative_version_queue_enabled
      ? stop_legislative_version_queue_worker()
      : Promise.resolve(),
  ]);
  await getPool().end();
  console.log("[PrismRosettaWorker] shutdown_complete", { signal });
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
