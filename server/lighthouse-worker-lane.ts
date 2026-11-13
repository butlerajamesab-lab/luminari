/**
 * Explicit runtime lane selection for the EXISTING suspended Prism canary
 * Render service. No default is safe: an old deployment must not start its
 * broad Prism/Rosetta workers merely because it is unsuspended.
 */
export type LighthouseWorkerLane = "docket_archive_only" | "prism_canary_legacy";

type Configuration = Record<string, string | undefined>;

export const DISALLOWED_ARCHIVE_FEATURE_GRANTS = [
  "PRISM_ROSETTA_QUEUE_ENABLED",
  "LEGISLATIVE_VERSION_QUEUE_ENABLED",
  "DOCKET_STATE_CACHE_WARMER_ENABLED",
  "CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED",
  "ROSETTA_GENOME_ACTIVATION_QUEUE_ENABLED",
  "ROSETTA_GENOME_TARGET_SYNC_ENABLED",
  "ROSETTA_GENOME_UPGRADE_QUEUE_ENABLED",
  "FRESH_ATOMIC_CORPUS_RESUME_ENABLED",
] as const;

export function resolveLighthouseWorkerLane(env: Configuration): LighthouseWorkerLane {
  const lane = env.LIGHTHOUSE_WORKER_LANE;
  if (lane === "docket_archive_only" || lane === "prism_canary_legacy") return lane;
  throw new Error("lighthouse_worker_lane_explicit_selection_required");
}

export function assertArchiveOnlyWorkerConfiguration(env: Configuration): void {
  if (env.LIGHTHOUSE_RUNTIME_ROLE !== "worker") {
    throw new Error("docket_archive_host_worker_role_required");
  }
  if (env.DOCKET_BILL_ACTIVATION_QUEUE_ENABLED !== "true") {
    throw new Error("docket_archive_host_queue_grant_required");
  }
  if (env.DOCKET_BILL_ACTIVATION_SOURCE_SCOPE !== "legiscan_bulk_json") {
    throw new Error("docket_archive_host_source_scope_required");
  }
  // One job at a time for the initial 512 MB instance's controlled pilot.
  if (env.DOCKET_BILL_ACTIVATION_CONCURRENCY !== "1") {
    throw new Error("docket_archive_host_initial_concurrency_must_be_one");
  }
  for (const key of DISALLOWED_ARCHIVE_FEATURE_GRANTS) {
    if (env[key] === "true") {
      throw new Error("docket_archive_host_unrelated_feature_enabled: " + key);
    }
  }
}
