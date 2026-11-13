import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertArchiveOnlyWorkerConfiguration,
  DISALLOWED_ARCHIVE_FEATURE_GRANTS,
  resolveLighthouseWorkerLane,
} from "./lighthouse-worker-lane";

const valid = {
  LIGHTHOUSE_WORKER_LANE: "docket_archive_only",
  LIGHTHOUSE_RUNTIME_ROLE: "worker",
  DOCKET_BILL_ACTIVATION_QUEUE_ENABLED: "true",
  DOCKET_BILL_ACTIVATION_SOURCE_SCOPE: "legiscan_bulk_json",
  DOCKET_BILL_ACTIVATION_CONCURRENCY: "1",
  DOCKET_BILL_ACTIVATION_QUEUE_POLL_MS: "5000",
};

describe("repurposed suspended Prism canary worker dispatch", () => {
  it("requires an explicit worker lane: no legacy autostart by default", () => {
    expect(() => resolveLighthouseWorkerLane({})).toThrow(
      "lighthouse_worker_lane_explicit_selection_required"
    );
    expect(() => resolveLighthouseWorkerLane({ LIGHTHOUSE_WORKER_LANE: "prism" }))
      .toThrow("lighthouse_worker_lane_explicit_selection_required");
    expect(resolveLighthouseWorkerLane(valid)).toBe("docket_archive_only");
    expect(resolveLighthouseWorkerLane({ LIGHTHOUSE_WORKER_LANE: "prism_canary_legacy" }))
      .toBe("prism_canary_legacy");
  });

  it("requires archive-only source scope and a single worker", () => {
    expect(() => assertArchiveOnlyWorkerConfiguration(valid)).not.toThrow();
    for (const [key, value, error] of [
      ["LIGHTHOUSE_RUNTIME_ROLE", "web", "worker_role_required"],
      ["DOCKET_BILL_ACTIVATION_QUEUE_ENABLED", "false", "queue_grant_required"],
      ["DOCKET_BILL_ACTIVATION_SOURCE_SCOPE", "all", "source_scope_required"],
      ["DOCKET_BILL_ACTIVATION_CONCURRENCY", "5", "concurrency_must_be_one"],
    ]) {
      expect(() => assertArchiveOnlyWorkerConfiguration({ ...valid, [key]: value }))
        .toThrow(error);
    }
    expect(() => assertArchiveOnlyWorkerConfiguration({
      ...valid, DOCKET_BILL_ACTIVATION_CONCURRENCY: undefined,
    })).toThrow("concurrency_must_be_one");
  });

  it("rejects every legacy Prism/Rosetta/LegiScan-feature grant", () => {
    for (const key of DISALLOWED_ARCHIVE_FEATURE_GRANTS) {
      expect(() => assertArchiveOnlyWorkerConfiguration({ ...valid, [key]: "true" }))
        .toThrow("docket_archive_host_unrelated_feature_enabled: " + key);
    }
  });

  it("keeps legacy canary imports behind an explicit branch", () => {
    const host = readFileSync("server/lighthouse-worker-host.ts", "utf8");
    const worker = readFileSync("server/docket-archive-activation-worker.ts", "utf8");
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(host).toContain('if (lane === "docket_archive_only")');
    expect(host).toContain('delete process.env.LEGISCAN_API_KEY');
    expect(host).toContain('await import("./docket-archive-activation-worker")');
    expect(host).toContain('await import("./prism-rosetta-worker")');
    expect(host).not.toMatch(/^import .*from ["']\.\/prism-rosetta-worker["']/m);
    expect(host).not.toMatch(/^import ["']\.\/prism-rosetta-worker["']/m);
    expect(worker).toContain('resolve_docket_activation_source_scope() !== "legiscan_bulk_json"');
    expect(pkg.scripts["build:prism-worker"]).toContain("server/lighthouse-worker-host.ts");
    expect(pkg.scripts["build:prism-worker"]).toContain("dist/prism-rosetta-worker.js");
    expect(pkg.scripts["build:prism-worker-legacy"]).toContain("server/prism-rosetta-worker.ts");
    expect(pkg.scripts["build:docket-archive-worker"]).toContain("server/docket-archive-activation-worker.ts");
  });
});
