import { describe, expect, it } from "vitest";
import {
  assert_safe_public_table_name,
  resolve_direct_sunam_instruction,
} from "./sunam-runtime-contract";

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
