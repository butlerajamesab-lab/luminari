import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const applied = readFileSync(
  "supabase/verification/applied/20261017000912_retire_genome_legacy_structural_view_access_20261016.sql",
  "utf8",
);
const replay = readFileSync(
  "supabase/migrations/20261017000912_retire_genome_legacy_structural_view_access_20261016.sql",
  "utf8",
);
const parity = readFileSync("scripts/audit-supabase-migration-ledger-parity.py", "utf8");

describe("four-view production retirement versus zero-state replay", () => {
  it("retains the exact applied production SQL instead of altering its receipt", () => {
    expect(createHash("md5").update(applied).digest("hex")).toBe(
      "0dcc197ff30adf74f88ed4d358f572dd",
    );
    expect(applied).toContain("database write quarantine ledger differs");
    expect(parity).toContain('"20261017000912"');
    expect(parity).toContain('"0dcc197ff30adf74f88ed4d358f572dd"');
    expect(parity).toContain('"1fc17005d93bd6ece8b50614da58a4fa82cd71cf"');
    expect(parity).toContain('"2291d56d4b6e97773ad4354a9b2d8740aadc7392"');
  });

  it("requires the prior quarantine migration and unchanged permission/trigger fences", () => {
    expect(replay).toContain("version='20261015135444'");
    expect(replay).toContain("name='civic_genome_rosetta_sql_write_quarantine_v1'");
    expect(replay).toContain("database write quarantine migration missing");
    expect(replay).not.toContain("database write quarantine ledger differs");
    expect(replay.match(/database write quarantine changed/g)).toHaveLength(2);
    expect(replay.match(/structural view definition or ownership changed/g)).toHaveLength(2);
    expect(replay).toContain("REVOKE ALL PRIVILEGES ON TABLE public.docket_bill_drift_delta");
    expect(replay).toContain("structural view application SELECT remains");
    expect(replay).toContain("view cut observed row conservation drift");
    for (const name of [
      "civic_genome_trait",
      "civic_genome_assembly_run",
      "civic_genome_rosetta_structural_representation",
      "civic_genome_rosetta_source_binding",
      "civic_genome_rosetta_generation_target",
      "civic_genome_bill",
      "civic_genome_bill_version",
      "civic_genome_projection_entity_version",
      "civic_genome_rosetta_generation_activation_queue",
      "civic_genome_rosetta_generation_upgrade_queue",
    ]) {
      expect(replay).toContain("'" + name + "'");
    }
  });
});
