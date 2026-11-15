import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  QUEUE_CIRCUIT_OPEN_DETAIL,
  circuit_open_log_gate,
  queue_circuit_open_remaining_ms,
} from "./queue-circuit-log";

const here = path.dirname(fileURLToPath(import.meta.url));

function read_source(relative: string): string {
  return readFileSync(path.join(here, relative), "utf8");
}

function circuit_open_error(remaining_ms: number): Error {
  const error = new Error("docket_bill_activation_queue_claim queue circuit open");
  error.name = "DbTimeoutDiagnosticError";
  (error as any).detail = QUEUE_CIRCUIT_OPEN_DETAIL;
  (error as any).timeout_ms = remaining_ms;
  return error;
}

describe("queue_circuit_open_remaining_ms", () => {
  it("returns the remaining pause for the synthetic circuit-open error", () => {
    expect(queue_circuit_open_remaining_ms(circuit_open_error(266_537))).toBe(266_537);
    expect(queue_circuit_open_remaining_ms(circuit_open_error(0))).toBe(0);
  });

  it("rejects real timeout errors and unrelated values", () => {
    const real_timeout = new Error("query timed out");
    real_timeout.name = "DbTimeoutDiagnosticError";
    (real_timeout as any).detail = "canceling statement due to statement timeout";
    (real_timeout as any).timeout_ms = 5_000;
    expect(queue_circuit_open_remaining_ms(real_timeout)).toBeNull();

    const wrong_name = circuit_open_error(100);
    wrong_name.name = "Error";
    expect(queue_circuit_open_remaining_ms(wrong_name)).toBeNull();

    const no_timeout = circuit_open_error(100);
    delete (no_timeout as any).timeout_ms;
    expect(queue_circuit_open_remaining_ms(no_timeout)).toBeNull();

    expect(queue_circuit_open_remaining_ms(new Error("boom"))).toBeNull();
    expect(queue_circuit_open_remaining_ms(null)).toBeNull();
    expect(queue_circuit_open_remaining_ms("queue_query_circuit_open")).toBeNull();
    expect(queue_circuit_open_remaining_ms(undefined)).toBeNull();
  });
});

describe("circuit_open_log_gate", () => {
  it("logs once per opening and stays silent for the rest of the pause", () => {
    const gate = new circuit_open_log_gate();
    expect(gate.should_log(1_000, 5_000)).toBe(true);
    expect(gate.should_log(2_000, 4_000)).toBe(false);
    expect(gate.should_log(5_999, 1)).toBe(false);
    // The pause has expired: a new opening logs again.
    expect(gate.should_log(6_000, 3_000)).toBe(true);
    expect(gate.should_log(6_500, 2_500)).toBe(false);
  });

  it("reset after a successful claim makes the next opening log immediately", () => {
    const gate = new circuit_open_log_gate();
    expect(gate.should_log(1_000, 300_000)).toBe(true);
    expect(gate.should_log(2_000, 299_000)).toBe(false);
    gate.reset();
    expect(gate.should_log(3_000, 10_000)).toBe(true);
  });
});

describe("circuit-open log wiring", () => {
  it("the diagnostics layer throws the shared circuit-open detail constant", () => {
    const diagnostics = read_source("queue-db-diagnostics.ts");
    expect(diagnostics).toContain("QUEUE_CIRCUIT_OPEN_DETAIL");
    expect(diagnostics).toContain("assert_circuit_closed");
    expect(diagnostics).toContain("record_timeout");
  });

  it.each([
    ["docket-jurisdiction-activation-queue-worker.ts", "[DocketJurisdictionActivation] cycle_waiting"],
    ["services/prism-rosetta-queue-worker.ts", "[PrismRosettaQueue] cycle_waiting"],
    ["civic-genome-rosetta-generation-queue-worker.ts", "[RosettaGenerationQueue] cycle_waiting"],
    ["civic-genome-rosetta-generation-upgrade-worker.ts", "[RosettaGenerationUpgrade] cycle_waiting"],
  ])("%s logs circuit pauses once per opening, not as cycle failures", (file, waiting_line) => {
    const source = read_source(file);
    expect(source).toContain("queue_circuit_open_remaining_ms");
    expect(source).toContain("circuit_open_log_gate");
    expect(source).toContain(waiting_line);
    expect(source).toContain("circuit_open_log.reset()");
    expect(source).toContain("circuit_open_log.should_log(Date.now(), circuit_remaining_ms)");
  });
});
