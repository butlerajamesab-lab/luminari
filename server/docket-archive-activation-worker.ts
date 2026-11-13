import "dotenv/config";
import {
  background_feature_enabled,
  resolve_lighthouse_runtime_role,
} from "./runtime-role";
import {
  resolve_docket_activation_source_scope,
  start_docket_bill_activation_queue_worker,
  run_docket_bill_activation_queue_cycle,
  stop_docket_bill_activation_queue_worker,
} from "./docket-jurisdiction-activation-queue-worker";

/**
 * Dedicated process host for the EXISTING canonical Docket activation engine.
 * It cannot start the Prism/Rosetta workers, state-cache warmer, or a provider
 * polling loop; it only claims receipt-bound archive jobs through the Docket
 * queue. No new projector, processing queue, or alternate registration path.
 */
const role = resolve_lighthouse_runtime_role();
if (!role.valid || role.role !== "worker") {
  throw new Error("docket_archive_runtime_worker_role_required");
}
if (resolve_docket_activation_source_scope() !== "legiscan_bulk_json") {
  throw new Error("docket_archive_runtime_archive_only_scope_required");
}
if (!background_feature_enabled("DOCKET_BILL_ACTIVATION_QUEUE_ENABLED")) {
  throw new Error("docket_archive_runtime_activation_grant_required");
}

const single_cycle_pilot = process.env.DOCKET_ARCHIVE_PILOT_MODE === "one_cycle";
if (single_cycle_pilot) {
  // The repurposed canary may claim at most ONE eligible archive job per
  // process start (concurrency is independently required to equal 1).
  // No poll timer is installed in this mode.
  if (process.env.DOCKET_BILL_ACTIVATION_CONCURRENCY !== "1") {
    throw new Error("docket_archive_pilot_concurrency_must_be_one");
  }
  void run_docket_bill_activation_queue_cycle().then(() => {
    console.log("[DocketArchiveWorker] one_cycle_pilot_finished");
  });
} else {
  start_docket_bill_activation_queue_worker();
}
console.log("[DocketArchiveWorker] started", {
  source_scope: "legiscan_bulk_json",
  pilot_mode: single_cycle_pilot ? "one_cycle" : "continuous",
  provider_api_requests_authorized: false,
  rosetta_execution_authorized: false,
  service_id: process.env.RENDER_SERVICE_ID ?? null,
  commit: process.env.RENDER_GIT_COMMIT ?? null,
});

const keep_alive = setInterval(() => undefined, 60_000);
let shutting_down = false;

async function shutdown(signal: string): Promise<void> {
  if (shutting_down) return;
  shutting_down = true;
  clearInterval(keep_alive);
  await stop_docket_bill_activation_queue_worker();
  console.log("[DocketArchiveWorker] stopped", { signal });
  process.exit(0);
}

process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
