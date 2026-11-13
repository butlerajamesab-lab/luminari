import "dotenv/config";
import {
  assertArchiveOnlyWorkerConfiguration,
  resolveLighthouseWorkerLane,
} from "./lighthouse-worker-lane";

/**
 * Fail-closed switch for the EXISTING Render service's historical
 * `dist/prism-rosetta-worker.js` build/start command.
 *
 * The legacy workers are dynamically loaded ONLY for an explicit legacy
 * selection. Under archive-only mode, none of the Prism/Rosetta startup
 * modules or their top-level side effects is evaluated.
 */
const lane = resolveLighthouseWorkerLane(process.env);

if (lane === "docket_archive_only") {
  assertArchiveOnlyWorkerConfiguration(process.env);

  // Never let the archive-only service inherit paid API access, even if a
  // historical Render secret remains present on the repurposed instance.
  delete process.env.LEGISCAN_API_KEY;

  console.log("[LighthouseWorkerHost] selected", {
    lane: "docket_archive_only",
    provider_api_requests_authorized: false,
    prism_rosetta_workers_authorized: false,
    service_id: process.env.RENDER_SERVICE_ID ?? null,
    commit: process.env.RENDER_GIT_COMMIT ?? null,
  });
  await import("./docket-archive-activation-worker");
} else {
  // Retain the old canary for a future separately approved and scoped use.
  // This branch is NOT reached when archive-only mode is configured.
  await import("./prism-rosetta-worker");
}
