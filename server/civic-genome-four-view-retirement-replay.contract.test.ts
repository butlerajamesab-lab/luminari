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
    expect(parity).toContain('"83c9f0d8d688f123d3bb6b0ca4244d0b86afa99c"');
  });

  it("requires exact safe prior ACL variants and completes the full protected permission cut", () => {
    // Three Docket views may enter replay with service_role SELECT already
    // revoked. Each may match only one of two pinned ACLs, not an arbitrary
    // safer-looking or more-permissive ACL. Prism has exactly one allowed ACL.
    expect(replay).toContain("WITH approved_prior(name,acl) AS(VALUES");
    expect((replay.match(/service_role=arwdDxtm\/postgres/g) ?? []).length).toBe(3);
    expect((replay.match(/service_role=Dxtm\/postgres/g) ?? []).length).toBe(3);
    expect((replay.match(/service_role=r\/postgres/g) ?? []).length).toBe(1);
    expect(replay).toContain("SELECT count(DISTINCT c.oid) INTO matched");
    expect(replay).toContain("c.relacl::text=a.acl");
    expect(replay).toContain("original structural view ACL differs");
    expect(replay).toContain("original structural view access differs");
    expect(replay).toContain("CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role'))");
    expect(replay).toContain("e.name <> 'public.v_civic_genome_prism_verification_status'");
    expect(replay).toContain("IS NOT DISTINCT FROM (r.role_name='service_role')");
    expect(replay).toContain("REVOKE ALL PRIVILEGES ON TABLE public.docket_bill_drift_delta");
    expect(replay).toContain("non-owner structural view privileges remain");
    expect(replay).toContain("structural view application SELECT remains");
    expect(replay).toContain("view cut observed row conservation drift");
    expect(applied).not.toContain("WITH approved_prior");
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
