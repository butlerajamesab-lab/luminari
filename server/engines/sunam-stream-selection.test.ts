import { describe, expect, it } from "vitest";
import {
  classify_sunam_retry_failed_streams,
  classify_sunam_run_all_streams,
  normalize_sunam_stream_registry_row,
  type sunam_stream_registry_row,
} from "./sunam-stream-selection";

function stream(
  overrides: Partial<sunam_stream_registry_row> & { stream_id: string },
): sunam_stream_registry_row {
  return {
    stream_name: overrides.stream_id,
    enabled: true,
    auto_disabled: false,
    consecutive_failures: 0,
    last_failure_at: null,
    last_run_status: "healthy",
    disabled_reason: null,
    ...overrides,
  };
}

describe("normalize_sunam_stream_registry_row", () => {
  it("normalizes PostgreSQL bigint timestamps to finite numbers", () => {
    expect(
      normalize_sunam_stream_registry_row({
        stream_id: "sample",
        stream_name: "Sample",
        enabled: true,
        auto_disabled: false,
        consecutive_failures: 1,
        last_failure_at: "1784568599853",
        last_run_status: "failed",
        disabled_reason: null,
      }).last_failure_at,
    ).toBe(1_784_568_599_853);
  });

  it("converts invalid timestamp values to unresolved null", () => {
    expect(
      normalize_sunam_stream_registry_row({
        stream_id: "sample",
        stream_name: "Sample",
        enabled: true,
        auto_disabled: false,
        consecutive_failures: 1,
        last_failure_at: "not-a-timestamp",
        last_run_status: "failed",
        disabled_reason: null,
      }).last_failure_at,
    ).toBeNull();
  });
});

describe("classify_sunam_run_all_streams", () => {
  it("runs only enabled, non-auto-disabled, non-retired streams", () => {
    const selection = classify_sunam_run_all_streams([
      stream({ stream_id: "healthy-enabled" }),
      stream({
        stream_id: "enabled-but-auto-disabled",
        auto_disabled: true,
        consecutive_failures: 5,
      }),
      stream({ stream_id: "manually-disabled", enabled: false }),
      stream({
        stream_id: "retired",
        enabled: false,
        auto_disabled: true,
        last_run_status: "retired_superseded_by_atlas",
      }),
    ]);

    expect(selection.eligible.map((row) => row.stream_id)).toEqual([
      "healthy-enabled",
    ]);
    expect(
      selection.excluded_auto_disabled.map((row) => row.stream_id),
    ).toEqual(["enabled-but-auto-disabled"]);
    expect(selection.excluded_disabled.map((row) => row.stream_id)).toEqual([
      "manually-disabled",
    ]);
    expect(selection.excluded_retired.map((row) => row.stream_id)).toEqual([
      "retired",
    ]);
  });

  it("sorts each selection deterministically by stream identity", () => {
    const selection = classify_sunam_run_all_streams([
      stream({ stream_id: "z-stream" }),
      stream({ stream_id: "a-stream" }),
    ]);

    expect(selection.eligible.map((row) => row.stream_id)).toEqual([
      "a-stream",
      "z-stream",
    ]);
  });
});

describe("classify_sunam_retry_failed_streams", () => {
  it("uses current registry failure state and the declared lookback", () => {
    const cutoff = 1_000_000;
    const selection = classify_sunam_retry_failed_streams(
      [
        stream({
          stream_id: "recent-failure",
          consecutive_failures: 2,
          last_failure_at: cutoff,
          last_run_status: "failed",
        }),
        stream({
          stream_id: "old-failure",
          consecutive_failures: 2,
          last_failure_at: cutoff - 1,
          last_run_status: "failed",
        }),
        stream({
          stream_id: "cleared-failure",
          consecutive_failures: 0,
          last_failure_at: cutoff + 100,
          last_run_status: "healthy",
        }),
      ],
      cutoff,
    );

    expect(selection.eligible.map((row) => row.stream_id)).toEqual([
      "recent-failure",
    ]);
  });

  it("reports recent safety exclusions instead of bypassing them", () => {
    const cutoff = 1_000_000;
    const selection = classify_sunam_retry_failed_streams(
      [
        stream({
          stream_id: "auto-disabled",
          auto_disabled: true,
          consecutive_failures: 5,
          last_failure_at: cutoff + 1,
          last_run_status: "failed",
        }),
        stream({
          stream_id: "retired",
          enabled: false,
          auto_disabled: true,
          consecutive_failures: 1,
          last_failure_at: cutoff + 1,
          last_run_status: "retired_superseded_by_atlas",
        }),
      ],
      cutoff,
    );

    expect(
      selection.excluded_auto_disabled.map((row) => row.stream_id),
    ).toEqual(["auto-disabled"]);
    expect(selection.excluded_retired.map((row) => row.stream_id)).toEqual([
      "retired",
    ]);
    expect(selection.eligible).toEqual([]);
  });
});
