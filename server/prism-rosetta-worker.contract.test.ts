import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("isolated Prism worker deployment contract", () => {
  it("starts only the dedicated Prism queue entrypoint with a required canary", () => {
    const entrypoint = readFileSync("server/prism-rosetta-worker.ts", "utf8");
    const blueprint = readFileSync("render.prism-worker.yaml", "utf8");

    expect(entrypoint).toContain('background_feature_enabled("PRISM_ROSETTA_QUEUE_ENABLED")');
    expect(entrypoint).toContain("prism_worker_canary_queue_id_required");
    expect(entrypoint).toContain("start_prism_rosetta_queue_worker()");
    expect(entrypoint).not.toContain("initializeScheduler");
    expect(entrypoint).not.toContain("start_legislative_version_queue_worker");
    expect(entrypoint).not.toContain("start_docket_state_cache_warmer");

    expect(blueprint).toContain("type: worker");
    expect(blueprint).toContain("LIGHTHOUSE_RUNTIME_ROLE");
    expect(blueprint).toContain("PRISM_ROSETTA_QUEUE_CANARY_ID");
    expect(blueprint).toContain("PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS");
    expect(blueprint).not.toContain("LEGISLATIVE_VERSION_QUEUE_ENABLED");
  });
});
