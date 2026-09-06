import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_MANIFEST_ID,
  DEFAULT_PANEL_TABLE,
  parse_args,
  should_execute_claim,
  summarize_results,
} from "./rosetta-c3-sealed-panel-runner";

describe("Rosetta C3 sealed panel runner", () => {
  it("defaults to the sealed Kimi panel and receipted members only", () => {
    const options = parse_args([]);

    expect(options.manifest_id).toBe(DEFAULT_PANEL_MANIFEST_ID);
    expect(options.panel_table).toBe(DEFAULT_PANEL_TABLE);
    expect(options.include_unreceipted).toBe(false);
    expect(options.dry_run).toBe(false);
  });

  it("requires an explicit opt-in before unreceipted rows can be selected", () => {
    const options = parse_args(["--include-unreceipted", "--limit", "3"]);

    expect(options.include_unreceipted).toBe(true);
    expect(options.limit).toBe(3);
  });

  it("executes only live running claims", () => {
    expect(should_execute_claim({ attempt_state: "running" })).toBe(true);
    expect(should_execute_claim({ attempt_state: "rejected" })).toBe(false);
    expect(should_execute_claim({ attempt_state: "timed_out" })).toBe(false);
    expect(should_execute_claim(null)).toBe(false);
  });

  it("summarizes finalized, skipped, and error members separately", () => {
    const summary = summarize_results([
      {
        ordinal: 1,
        source_registry_id: "a",
        has_c3_receipt: true,
        config_hash: "c",
        closure_hash: "h",
        execution: { parser_invoked: true },
        final_receipt_id: "r",
      },
      {
        ordinal: 2,
        source_registry_id: "b",
        has_c3_receipt: false,
        config_hash: "c",
        closure_hash: "h",
        skipped_reason: "missing_c3_receipt",
      },
      {
        ordinal: 3,
        source_registry_id: "c",
        has_c3_receipt: true,
        config_hash: "c",
        closure_hash: "h",
        error_code: "57014",
      },
    ]);

    expect(summary).toEqual({
      selected_members: 3,
      c3_receipted_members: 2,
      skipped_members: 1,
      executed_members: 1,
      finalized_members: 1,
      error_members: 1,
    });
  });

  it("rejects malformed manifest ids and panel table names", () => {
    expect(() => parse_args(["--manifest-id", "not-a-uuid"])).toThrow("invalid_uuid");
    expect(() => parse_args(["--panel-table", "rosetta_replay.panel;drop"])).toThrow(
      "invalid_panel_table",
    );
  });
});
