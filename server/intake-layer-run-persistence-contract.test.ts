import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("server/intake-layer-run-persistence.ts", "utf8");

describe("intake layer run persistence adapter", () => {
  it("routes all persisted engine executions through the v3 PostgreSQL verifier", () => {
    expect(source).toContain("register_intake_layer_execution_v3");
    expect(source).not.toContain("register_intake_layer_execution_v2(");
    expect(source).not.toContain("insert into public.intake_layer_runs");
  });

  it("requires explicit deterministic identity inputs before database registration", () => {
    expect(source).toContain("rule_manifest_hash");
    expect(source).toContain("execution_envelope");
    expect(source).toContain("input_hash");
    expect(source).toContain("output_hash");
    expect(source).toContain("unresolved_dependencies");
  });

  it("validates returned canonical receipt identities", () => {
    expect(source).toContain("registered_layer_run_id");
    expect(source).toContain("registered_receipt_hash");
    expect(source).toContain("registered_output_artifact_id");
    expect(source).toContain("reused_existing");
  });
});
