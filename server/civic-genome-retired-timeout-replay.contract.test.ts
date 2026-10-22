import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const startup = readFileSync(new URL("./services/prism-rosetta-startup-activation.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("./prism-rosetta-worker.ts", import.meta.url), "utf8");
const retired = readFileSync(new URL("./civic-genome-legacy-decomposition-retirement.ts", import.meta.url), "utf8");

describe("permanently retired auto-replay and LegiScan probe paths", () => {
  it("physically removes the old timeout requeue, not just its feature flag", () => {
    expect(existsSync(new URL("./civic-genome-current-authoritative-timeout-reconciliation.ts", import.meta.url))).toBe(false);
    expect(startup).not.toContain("reconcile_current_authoritative_legacy_rosetta_timeouts");
    expect(startup).not.toContain("ROSETTA_LEGACY_TIMEOUT_RECONCILIATION_ENABLED");
    expect(startup).toContain("start_docket_bill_activation_queue_worker()");
    expect(startup).toContain("start_civic_genome_final_source_reconciliation_worker()");
  });

  it("does not probe LegiScan or schedule hourly retries before checking permanent retirement", () => {
    const retry = worker.slice(
      worker.indexOf("function schedule_legislative_provider_probe_retry("),
      worker.indexOf("async function start_authorized_legislative_queue()"),
    );
    const startup = worker.slice(
      worker.indexOf("async function start_authorized_legislative_queue()"),
      worker.indexOf("console.log(\"[PrismRosettaWorker] starting\","),
    );
    expect(retry.indexOf("if (is_legacy_genome_decomposition_conveyor_retired()) return;")).toBeGreaterThanOrEqual(0);
    expect(retry.indexOf("if (is_legacy_genome_decomposition_conveyor_retired()) return;"))
      .toBeLessThan(retry.indexOf("setTimeout("));
    expect(startup.indexOf("if (is_legacy_genome_decomposition_conveyor_retired()) return;"))
      .toBeGreaterThanOrEqual(0);
    expect(startup.indexOf("if (is_legacy_genome_decomposition_conveyor_retired()) return;"))
      .toBeLessThan(startup.indexOf("await get_bill_text("));
    expect(retired).toContain("LEGACY_GENOME_DECOMPOSITION_CONVEYOR_RETIRED = true as const");
  });
});
