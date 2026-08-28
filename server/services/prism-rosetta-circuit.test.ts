import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquire_prism_rosetta_circuit_request,
  get_prism_rosetta_circuit_snapshot,
  prism_rosetta_circuit_allows_request,
  prism_rosetta_request_timeout_ms,
  record_prism_rosetta_circuit_failure,
  record_prism_rosetta_circuit_success,
  release_prism_rosetta_circuit_request,
  reset_prism_rosetta_circuit,
} from "./prism-rosetta-client";
import { PrismBoundaryError } from "./prism-verification-client";

describe("Prism Rosetta upstream circuit", () => {
  beforeEach(() => {
    reset_prism_rosetta_circuit();
    delete process.env.PRISM_ROSETTA_REQUEST_TIMEOUT_MS;
    process.env.PRISM_ROSETTA_CIRCUIT_FAILURE_THRESHOLD = "3";
    process.env.PRISM_ROSETTA_CIRCUIT_COOLDOWN_MS = "900000";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    reset_prism_rosetta_circuit();
    delete process.env.PRISM_ROSETTA_REQUEST_TIMEOUT_MS;
    delete process.env.PRISM_ROSETTA_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.PRISM_ROSETTA_CIRCUIT_COOLDOWN_MS;
    vi.restoreAllMocks();
  });

  it("bounds the configurable outbound timeout", () => {
    expect(prism_rosetta_request_timeout_ms(undefined)).toBe(15_000);
    expect(prism_rosetta_request_timeout_ms("not-a-number")).toBe(15_000);
    expect(prism_rosetta_request_timeout_ms(20_000)).toBe(20_000);
    expect(prism_rosetta_request_timeout_ms(100)).toBe(1_000);
    expect(prism_rosetta_request_timeout_ms(60_000)).toBe(30_000);
  });

  it("opens after three consecutive transient failures and allows one probe after cooldown", () => {
    const timeout = new PrismBoundaryError(
      "timeout",
      503,
      "prism_request_timed_out",
    );
    record_prism_rosetta_circuit_failure(timeout, "request-1", 1_000);
    record_prism_rosetta_circuit_failure(timeout, "request-2", 2_000);
    expect(get_prism_rosetta_circuit_snapshot(2_000)).toMatchObject({
      state: "closed",
      consecutive_failures: 2,
    });

    record_prism_rosetta_circuit_failure(timeout, "request-3", 3_000);
    expect(get_prism_rosetta_circuit_snapshot(3_000)).toMatchObject({
      state: "open",
      consecutive_failures: 3,
      open_until_ms: 903_000,
      remaining_cooldown_ms: 900_000,
      last_request_id: "request-3",
    });
    expect(prism_rosetta_circuit_allows_request(902_999)).toBe(false);
    expect(get_prism_rosetta_circuit_snapshot(903_000).state).toBe("half_open");
    expect(acquire_prism_rosetta_circuit_request("probe-1", 903_000)).toBe(
      true,
    );
    expect(acquire_prism_rosetta_circuit_request("probe-2", 903_000)).toBe(
      false,
    );
    expect(get_prism_rosetta_circuit_snapshot(903_000)).toMatchObject({
      state: "half_open",
      half_open_probe_request_id: "probe-1",
    });
    expect(prism_rosetta_circuit_allows_request(903_000)).toBe(false);
    release_prism_rosetta_circuit_request("probe-1");
    expect(acquire_prism_rosetta_circuit_request("probe-2", 903_000)).toBe(
      true,
    );
  });

  it("fails closed after one timeout for at least the measured upstream tail", () => {
    delete process.env.PRISM_ROSETTA_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.PRISM_ROSETTA_CIRCUIT_COOLDOWN_MS;
    const timeout = new PrismBoundaryError(
      "timeout",
      503,
      "prism_request_timed_out",
    );

    record_prism_rosetta_circuit_failure(timeout, "request-1", 1_000);

    expect(get_prism_rosetta_circuit_snapshot(1_000)).toMatchObject({
      state: "open",
      consecutive_failures: 1,
      open_until_ms: 901_000,
      remaining_cooldown_ms: 900_000,
    });
  });

  it("closes only after a successful receipt and ignores non-availability failures", () => {
    const timeout = new PrismBoundaryError(
      "timeout",
      503,
      "prism_request_timed_out",
    );
    record_prism_rosetta_circuit_failure(timeout, "request-1", 1_000);
    record_prism_rosetta_circuit_failure(
      new PrismBoundaryError("validation", 502, "invalid_prism_receipt"),
      "request-2",
      2_000,
    );
    record_prism_rosetta_circuit_failure(
      new PrismBoundaryError(
        "transient_upstream",
        503,
        "prism_rosetta_circuit_open",
      ),
      "request-3",
      3_000,
    );
    expect(get_prism_rosetta_circuit_snapshot(3_000)).toMatchObject({
      state: "closed",
      consecutive_failures: 1,
      last_request_id: "request-1",
    });

    record_prism_rosetta_circuit_success("request-4", 4_000);
    expect(get_prism_rosetta_circuit_snapshot(4_000)).toMatchObject({
      state: "closed",
      consecutive_failures: 0,
      open_until_ms: 0,
      last_request_id: null,
    });
  });
});
