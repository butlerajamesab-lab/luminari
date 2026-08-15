import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { binding_requires_upgrade } from "./civic-genome-rosetta-generation-upgrade-worker";

const current = {
  contract: "rosetta-current-generation-v1",
  engine_version: "rosetta-v3-deterministic-sql-2.5.3",
  rule_set_version: "rosetta-five-layer-structural-correctness-2.5.3",
  rule_manifest_hash: "a".repeat(64),
};

describe("Civic Genome Rosetta generation upgrades", () => {
  it("upgrades only when the bound Rosetta generation differs from Rosetta current", () => {
    expect(binding_requires_upgrade({
      rosetta_engine_version: current.engine_version,
      rosetta_rule_set_version: current.rule_set_version,
    }, current)).toBe(false);

    expect(binding_requires_upgrade({
      rosetta_engine_version: "rosetta-v3-deterministic-sql-2.4.0",
      rosetta_rule_set_version: "rosetta-five-layer-structural-correctness-2.4.0",
    }, current)).toBe(true);
  });

  it("requests exact-source replay from Rosetta rather than implementing decomposition downstream", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/civic-genome-rosetta-generation-upgrade-worker.ts"),
      "utf8",
    );
    expect(source).toContain("rosetta_current_generation_v1");
    expect(source).toContain("rosetta_replay_source_identity_current_v1");
    expect(source).toContain("p_source_identity_hash: row.source_identity_hash");
    expect(source).not.toMatch(/run_rosetta_v3_extraction\s*\(/);
  });
});
