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
import { get_bill_text } from "./services/legiscan";

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
const legiscan_bill_text_probe_document_id = Number(
  process.env.LEGISCAN_BILL_TEXT_PROBE_DOCUMENT_ID?.trim(),
);
const legiscan_bill_text_probe_configured =
  Number.isSafeInteger(legiscan_bill_text_probe_document_id)
  && legiscan_bill_text_probe_document_id > 0;

let legislative_version_queue_enabled = false;
let shutting_down = false;

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
  render_git_commit: process.env.RENDER_GIT_COMMIT ?? null,
  render_service_id: process.env.RENDER_SERVICE_ID ?? null,
  legislative_version_queue_requested,
  legislative_version_queue_enabled,
  legislative_version_queue_recovery_scope,
  legiscan_api_key_configured,
  legiscan_bill_text_probe_configured,
  legiscan_bill_text_probe_document_id:
    legiscan_bill_text_probe_configured
      ? legiscan_bill_text_probe_document_id
      : null,
});
start_prism_rosetta_queue_worker();
const legislative_version_queue_startup = start_authorized_legislative_queue();

const keep_alive = setInterval(() => undefined, 60_000);

async function shutdown(signal: string): Promise<void> {
  if (shutting_down) return;
  shutting_down = true;
  console.log("[PrismRosettaWorker] shutdown_started", { signal });
  clearInterval(keep_alive);
  await legislative_version_queue_startup;
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
