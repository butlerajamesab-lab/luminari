import "dotenv/config";
import "./services/fresh-corpus-atomic-startup";
import "./workers/corpus-import-queue-worker";
import { legislative_current_source_scope } from "./legislative-current-source-scope";
import express from "express";
import { createServer, type Server } from "node:http";
import { getPool } from "./db";
import {
  prism_rosetta_queue_batch_ids,
  prism_rosetta_queue_canary_id,
} from "./services/prism-rosetta-queue-selection";
import {
  start_prism_rosetta_queue_worker,
  stop_prism_rosetta_queue_worker,
} from "./services/prism-rosetta-queue-worker";
import {
  legislative_version_queue_recovery_contract_scope,
  start_current_result_observation_worker,
  start_legislative_version_queue_worker,
  stop_current_result_observation_worker,
  stop_legislative_version_queue_worker,
} from "./civic-genome-legislative-version-queue-worker";
import {
  background_feature_enabled,
  resolve_lighthouse_runtime_role,
} from "./runtime-role";
import { get_bill_text } from "./services/legiscan";
import { docket_router, wait_for_docket_state_refreshes } from "./routes/docket";
import {
  start_docket_state_cache_warmer,
  stop_docket_state_cache_warmer,
} from "./docket-state-cache-warmer";
import {
  start_docket_bill_activation_queue_worker,
  stop_docket_bill_activation_queue_worker,
} from "./docket-jurisdiction-activation-queue-worker";
import {
  start_civic_genome_final_source_reconciliation_worker,
  stop_civic_genome_final_source_reconciliation_worker,
} from "./civic-genome-final-source-reconciliation-worker";

const runtime_role = resolve_lighthouse_runtime_role();
if (runtime_role.role !== "worker" || !runtime_role.valid) {
  throw new Error("prism_worker_runtime_role_required");
}
if (!background_feature_enabled("PRISM_ROSETTA_QUEUE_ENABLED")) {
  throw new Error("prism_worker_feature_grant_required");
}
const canary_queue_id = prism_rosetta_queue_canary_id();
const batch_queue_ids = prism_rosetta_queue_batch_ids();
if (!canary_queue_id && !batch_queue_ids) {
  throw new Error("prism_worker_queue_scope_required");
}
const legislative_version_queue_requested = background_feature_enabled(
  "LEGISLATIVE_VERSION_QUEUE_ENABLED",
);
const legislative_current_sources = legislative_version_queue_requested
  && legislative_current_source_scope();
const legislative_version_queue_recovery_scope =
  legislative_version_queue_requested
    ? legislative_version_queue_recovery_contract_scope()
    : null;
if (
  legislative_version_queue_requested &&
  !legislative_version_queue_recovery_scope && !legislative_current_sources
) {
  throw new Error("prism_worker_legislative_recovery_scope_required");
}
const legiscan_api_key_configured = Boolean(
  process.env.LEGISCAN_API_KEY?.trim(),
);
const legiscan_bill_text_probe_document_id = Number(
  process.env.LEGISCAN_BILL_TEXT_PROBE_DOCUMENT_ID?.trim(),
);
const legiscan_bill_text_probe_configured =
  Number.isSafeInteger(legiscan_bill_text_probe_document_id)
  && legiscan_bill_text_probe_document_id > 0;

let legislative_version_queue_enabled = false;
let current_result_observation_enabled = false;
let docket_loopback_server: Server | null = null;
let shutting_down = false;

async function start_docket_workers(): Promise<void> {
  const cache_warmer_requested = background_feature_enabled(
    "DOCKET_STATE_CACHE_WARMER_ENABLED",
  );
  const activation_queue_requested = background_feature_enabled(
    "DOCKET_BILL_ACTIVATION_QUEUE_ENABLED",
  );
  const final_source_reconciliation_requested = background_feature_enabled(
    "CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED",
  );
  if (
    !cache_warmer_requested
    && !activation_queue_requested
    && !final_source_reconciliation_requested
  ) return;

  if (activation_queue_requested) {
    start_docket_bill_activation_queue_worker();
  }
  if (final_source_reconciliation_requested) {
    start_civic_genome_final_source_reconciliation_worker();
  }
  if (!cache_warmer_requested) return;

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/docket", docket_router);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  docket_loopback_server = server;
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("docket_worker_loopback_address_unavailable");
  }
  start_docket_state_cache_warmer(address.port);
  console.log("[DocketWorker] started", {
    cache_warmer_requested,
    activation_queue_requested,
    loopback_port: address.port,
  });
}

function stable_legiscan_failure_code(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown";
  const [candidate] = message.split(":", 1);
  return candidate && /^[a-z0-9_]+$/.test(candidate)
    ? candidate
    : "unknown_legiscan_probe_failure";
}

async function start_authorized_legislative_queue(): Promise<void> {
  if (!legislative_version_queue_requested) return;
  if (!legiscan_api_key_configured) {
    console.error(
      "[PrismRosettaWorker] legislative_queue_disabled_missing_legiscan_api_key",
    );
    return;
  }
  if (!legiscan_bill_text_probe_configured) {
    console.error(
      "[PrismRosettaWorker] legislative_queue_disabled_invalid_legiscan_bill_text_probe",
    );
    return;
  }

  console.log("[PrismRosettaWorker] legiscan_bill_text_probe_started", {
    document_id: legiscan_bill_text_probe_document_id,
  });
  try {
    await get_bill_text(legiscan_bill_text_probe_document_id);
  } catch (error) {
    console.error(
      "[PrismRosettaWorker] legislative_queue_disabled_legiscan_bill_text_probe_failed",
      { error_code: stable_legiscan_failure_code(error) },
    );
    return;
  }

  if (shutting_down) {
    console.log(
      "[PrismRosettaWorker] legislative_queue_start_skipped_during_shutdown",
    );
    return;
  }
  try {
    start_legislative_version_queue_worker();
    legislative_version_queue_enabled = true;
  } catch (error) {
    console.error(
      "[PrismRosettaWorker] legislative_queue_start_failed",
      { error_code: stable_legiscan_failure_code(error) },
    );
    return;
  }
  console.log(
    "[PrismRosettaWorker] legislative_queue_credential_accepted",
    { document_id: legiscan_bill_text_probe_document_id },
  );
}

console.log("[PrismRosettaWorker] starting", {
  runtime_role: runtime_role.role,
  canary_queue_id,
  batch_queue_ids,
  render_git_commit: process.env.RENDER_GIT_COMMIT ?? null,
  render_service_id: process.env.RENDER_SERVICE_ID ?? null,
  legislative_version_queue_requested,
  legislative_version_queue_enabled,
  legislative_version_queue_recovery_scope,
  legislative_current_sources,
  legiscan_api_key_configured,
  legiscan_bill_text_probe_configured,
  legiscan_bill_text_probe_document_id:
    legiscan_bill_text_probe_configured
      ? legiscan_bill_text_probe_document_id
      : null,
});
start_prism_rosetta_queue_worker();
if (!legislative_version_queue_recovery_scope) {
  start_current_result_observation_worker();
  current_result_observation_enabled = true;
}
const legislative_version_queue_startup = start_authorized_legislative_queue();
const docket_worker_startup = start_docket_workers().catch(error => {
  console.error("[DocketWorker] startup_failed", {
    error_code: stable_legiscan_failure_code(error),
  });
});

const keep_alive = setInterval(() => undefined, 60_000);

async function shutdown(signal: string): Promise<void> {
  if (shutting_down) return;
  shutting_down = true;
  console.log("[PrismRosettaWorker] shutdown_started", { signal });
  clearInterval(keep_alive);
  await Promise.all([legislative_version_queue_startup, docket_worker_startup]);
  await stop_docket_state_cache_warmer();
  await stop_docket_bill_activation_queue_worker();
  stop_civic_genome_final_source_reconciliation_worker();
  if (docket_loopback_server) {
    await new Promise<void>(resolve => docket_loopback_server!.close(() => resolve()));
    docket_loopback_server = null;
  }
  await wait_for_docket_state_refreshes();
  await Promise.all([
    stop_prism_rosetta_queue_worker(),
    current_result_observation_enabled
      ? stop_current_result_observation_worker()
      : Promise.resolve(),
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
