import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assert_safe_public_table_name,
  launch_sunam_background_ingestion,
  resolve_direct_sunam_instruction,
  sunam_background_queue_testing,
} from "./sunam-runtime-contract";

describe("launch_sunam_background_ingestion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sunam_background_queue_testing.reset();
  });

  it("returns immediately and bounds concurrent ingestion pressure", async () => {
    const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { concurrency } = sunam_background_queue_testing.get_state();
    const job_count = concurrency + 1;
    const resolvers = new Map<
      number,
      (value: { success: boolean; recordsProcessed: number }) => void
    >();
    const tasks = Array.from({ length: job_count }, (_, index) =>
      vi.fn(
        () =>
          new Promise<{ success: boolean; recordsProcessed: number }>((resolve) => {
            resolvers.set(index, resolve);
          }),
      ),
    );

    const launches = tasks.map((task, index) =>
      launch_sunam_background_ingestion(`stream-${index}`, task),
    );

    expect(launches.slice(0, concurrency).every((item) => item.status === "started")).toBe(true);
    expect(launches.at(-1)).toMatchObject({
      stream_id: `stream-${job_count - 1}`,
      status: "queued",
    });
    expect(Number.isFinite(launches[0].accepted_at)).toBe(true);

    await vi.waitFor(() => {
      expect(tasks.filter((task) => task.mock.calls.length === 1)).toHaveLength(
        concurrency,
      );
      expect(sunam_background_queue_testing.get_state()).toMatchObject({
        active: concurrency,
        queued: 1,
      });
    });

    resolvers.get(0)?.({ success: true, recordsProcessed: 12 });

    await vi.waitFor(() => {
      expect(tasks[job_count - 1]).toHaveBeenCalledTimes(1);
      expect(sunam_background_queue_testing.get_state()).toMatchObject({
        active: concurrency,
        queued: 0,
      });
    });

    for (let index = 1; index < job_count; index += 1) {
      resolvers.get(index)?.({ success: true, recordsProcessed: index });
    }

    await vi.waitFor(() => {
      expect(sunam_background_queue_testing.get_state()).toMatchObject({
        active: 0,
        queued: 0,
      });
    });

    warn_spy.mockRestore();
  });

  it("captures background rejection without creating an unhandled promise", async () => {
    const error_spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const launch = launch_sunam_background_ingestion(
      "broken-stream",
      async () => {
        throw new Error("expected failure");
      },
    );

    expect(launch.status).toBe("started");
    await vi.waitFor(() => {
      expect(error_spy).toHaveBeenCalledWith(
        "[SUNAM] background_ingestion_failed",
        expect.objectContaining({
          stream_id: "broken-stream",
          error: "expected failure",
        }),
      );
      expect(sunam_background_queue_testing.get_state().active).toBe(0);
    });

    error_spy.mockRestore();
  });
});

describe("resolve_direct_sunam_instruction", () => {
  it("routes every Sovereign Control quick action without LLM interpretation", () => {
    expect(
      resolve_direct_sunam_instruction(
        "Get the current system state: all engines, streams, failures, and scheduler status",
      ),
    ).toEqual({ tool_name: "get_system_state", args: {} });

    expect(
      resolve_direct_sunam_instruction(
        "Find all failed streams from the last 24 hours and retry them",
      ),
    ).toEqual({
      tool_name: "retry_failed_streams",
      args: { hours_back: 24 },
    });

    expect(
      resolve_direct_sunam_instruction(
        "Run ingestion for all enabled data streams",
      ),
    ).toEqual({ tool_name: "run_all_streams", args: {} });

    expect(
      resolve_direct_sunam_instruction(
        "Get the last 20 entries from the execution log",
      ),
    ).toEqual({ tool_name: "get_execution_log", args: { limit: 20 } });

    expect(
      resolve_direct_sunam_instruction(
        "Get diagnostics for all streams that have consecutive failures",
      ),
    ).toEqual({ tool_name: "get_stream_diagnostics", args: {} });

    expect(
      resolve_direct_sunam_instruction(
        "Refresh all stream schedules from the registry",
      ),
    ).toEqual({ tool_name: "refresh_scheduler", args: {} });
  });

  it("bounds operator-provided windows and limits", () => {
    expect(
      resolve_direct_sunam_instruction(
        "Find all failed streams from the last 99999 hours and retry them",
      ),
    ).toEqual({
      tool_name: "retry_failed_streams",
      args: { hours_back: 720 },
    });

    expect(
      resolve_direct_sunam_instruction(
        "Get the last 1000 entries from the execution log",
      ),
    ).toEqual({ tool_name: "get_execution_log", args: { limit: 100 } });
  });

  it("does not directly execute negated, explanatory, or interrogative language", () => {
    const non_actions = [
      "Do not retry failed streams",
      "Explain how to retry failed streams",
      "Should I retry failed streams from the last 24 hours?",
      "Do not run ingestion for all enabled data streams",
      "Explain the current system state: all engines, streams, failures, and scheduler status",
      "Please refresh all stream schedules from the registry after you explain what that does",
    ];

    for (const instruction of non_actions) {
      expect(resolve_direct_sunam_instruction(instruction)).toBeNull();
    }
  });

  it("leaves nonstandard instructions for the governed tool-calling loop", () => {
    expect(
      resolve_direct_sunam_instruction(
        "Run the cfpb-complaints stream and report its records",
      ),
    ).toBeNull();
  });
});

describe("assert_safe_public_table_name", () => {
  it("accepts one ordinary PostgreSQL identifier", () => {
    expect(assert_safe_public_table_name("data_stream_registry")).toBe(
      "data_stream_registry",
    );
  });

  it("rejects qualified names and SQL fragments", () => {
    expect(() => assert_safe_public_table_name("public.users")).toThrow();
    expect(() => assert_safe_public_table_name("users; drop table users")).toThrow();
    expect(() => assert_safe_public_table_name("users --")).toThrow();
  });
});
