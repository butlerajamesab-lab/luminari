import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPROVED_TIERS,
  LEDGER_COLUMNS,
  REPAIR_VERSION,
  buildLedgerInsert,
  buildNameUpdate,
  filterApprovedProposals,
  manifestFor,
  passesPersonFacingNameTest,
  planRepairs,
} from "./apply-naming-repairs.mjs";

// The embedded apply set is the census output, staged into the repo
// so the run is reproducible from the repo alone. These tests hold
// it to the wave's declared rules: approved tiers only, every
// proposed name passing the person-facing name test (mirrored from
// server/services/resource-directory-unified.ts), and the manifest
// the production dry run must reproduce.
const EMBEDDED = JSON.parse(
  readFileSync(
    new URL("./naming-repair-proposals-v1.json", import.meta.url),
    "utf-8",
  ),
);
const EXPECTED_CENSUS_MANIFEST =
  "09ea44ecc09568a4ccf08ab3f602e520cb6fc0930be780ffdde34f2455c4fa7d";
// After the 2026-11-10 workbook-fidelity gate, the apply set is the
// fidelity-cleared subset: 2,155 of the census's 2,316 (the 161
// benefits_program_master-anchored rows are held — that sheet is
// UNVERIFIABLE). The subset manifest the production dry run must
// reproduce before --apply.
const EXPECTED_CLEARED_MANIFEST =
  "77423f2ac46811c5f869037abbbd705ac3e3fdb9020c29471824da465b8380c8";

const row = (overrides = {}) => ({
  entity_id: "11111111-2222-3333-4444-555555555555",
  old_name: "11111111-2222-3333-4444-555555555555",
  new_name: "Example Crisis Center",
  tier: "identity_direct",
  evidence: "v3_13 program_master:row:1",
  ...overrides,
});

describe("tier filter", () => {
  it("approves exactly the census identity tiers plus the reviewed survivor", () => {
    expect(APPROVED_TIERS).toEqual([
      "identity_direct",
      "identity_uuid",
      "identity_mirror",
      "c_strong",
    ]);
  });

  it("excludes conflicts, unresolved shells, and the special case by tier", () => {
    const { approved, excluded } = filterApprovedProposals([
      row(),
      row({ entity_id: "a", tier: "conflict_identity" }),
      row({ entity_id: "b", tier: "unresolved" }),
      row({
        entity_id: "c",
        tier: "special_gov",
        old_name: "Westchester Enriched Sciences Magnets",
        new_name: "Westchester Enriched Sciences Magnets",
      }),
    ]);
    expect(approved).toHaveLength(1);
    expect(excluded.map((e) => e.reason)).toEqual([
      "tier_not_approved",
      "tier_not_approved",
      "tier_not_approved",
    ]);
  });

  it("excludes no-ops, incomplete rows, and names that fail the name test", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({ entity_id: "a", new_name: row().old_name }),
      row({ entity_id: "b", new_name: "" }),
      row({
        entity_id: "c",
        new_name: "luminari-oregon-ENRICHED-PASS3-2026",
      }),
      // The Westchester mechanism: even in an approved tier, a
      // genuine name carrying the blanket 'enriched' clause's word
      // cannot be applied by this wave — it belongs to the name-test
      // precision fix.
      row({
        entity_id: "d",
        new_name: "Westchester Enriched Sciences Magnets",
      }),
    ]);
    expect(approved).toHaveLength(0);
    expect(excluded.map((e) => e.reason)).toEqual([
      "noop_name",
      "missing_fields",
      "new_name_fails_name_test",
      "new_name_fails_name_test",
    ]);
  });
});

describe("person-facing name test mirror", () => {
  it("mirrors the unified service's rules", () => {
    expect(passesPersonFacingNameTest("Butte Falls Police Department")).toBe(
      true,
    );
    expect(
      passesPersonFacingNameTest("58475814-e7e2-5b3d-a325-0e807e93f260"),
    ).toBe(false);
    expect(passesPersonFacingNameTest("9f68be2b4c1d2e3f405060708090a0b1")).toBe(
      false,
    );
    expect(passesPersonFacingNameTest("luminari-oregon-registry")).toBe(false);
    expect(passesPersonFacingNameTest("")).toBe(false);
    expect(passesPersonFacingNameTest(null)).toBe(false);
  });
});

describe("drift guard", () => {
  const approved = [
    row({ entity_id: "planned" }),
    row({ entity_id: "done", new_name: "Already Renamed Org" }),
    row({ entity_id: "moved", new_name: "Moved Org" }),
    row({ entity_id: "gone", new_name: "Gone Org" }),
  ];

  it("plans only rows whose current name still equals the census name", () => {
    const { planned, alreadyApplied, drift, missing } = planRepairs(approved, [
      { resource_entity_id: "planned", resource_name: approved[0].old_name },
      { resource_entity_id: "done", resource_name: "Already Renamed Org" },
      { resource_entity_id: "moved", resource_name: "Somebody Else Renamed It" },
    ]);
    expect(planned.map((r) => r.entity_id)).toEqual(["planned"]);
    expect(alreadyApplied).toEqual(["done"]);
    expect(drift).toEqual([
      {
        entity_id: "moved",
        expected_old_name: approved[2].old_name,
        found_name: "Somebody Else Renamed It",
      },
    ]);
    expect(missing).toEqual(["gone"]);
  });
});

describe("write builders", () => {
  it("builds a conflict-guarded ledger insert aligned to the migration", () => {
    const built = buildLedgerInsert([row(), row({ entity_id: "x" })]);
    expect(built.text).toContain("insert into public.luminari_naming_repairs");
    expect(built.text).toContain(LEDGER_COLUMNS.join(", "));
    expect(built.text).toContain("on conflict (resource_entity_id) do nothing");
    expect(built.params).toHaveLength(2 * LEDGER_COLUMNS.length);
    expect(built.params[5]).toBe(REPAIR_VERSION);
    expect(buildLedgerInsert([])).toBeNull();
  });

  it("builds a rename update that re-checks the census name at write time", () => {
    const built = buildNameUpdate([row()]);
    expect(built.text).toContain(
      "update public.luminari_resource_entities e",
    );
    expect(built.text).toContain("set resource_name = v.new_name");
    expect(built.text).toContain("e.resource_name = v.old_name");
    expect(built.params).toEqual([
      row().entity_id,
      row().old_name,
      row().new_name,
    ]);
    expect(buildNameUpdate([])).toBeNull();
  });

  it("pins the ledger columns to the migration that creates the table", () => {
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20261110220000_naming_repair_ledger_v1.sql",
        import.meta.url,
      ),
      "utf-8",
    );
    expect(migration).toContain(
      "create table if not exists public.luminari_naming_repairs",
    );
    for (const column of LEDGER_COLUMNS) {
      expect(migration).toContain(column);
    }
    for (const tier of APPROVED_TIERS) {
      expect(migration).toContain(`'${tier}'`);
    }
  });
});

describe("fidelity gate", () => {
  it("clears program_master and pass3 anchors in every evidence form", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({ entity_id: "a", evidence: "v3_13 program_master:row:9" }),
      row({ entity_id: "b", evidence: "v3_13 pass3_program_card:row:9" }),
      row({
        entity_id: "c",
        tier: "identity_uuid",
        evidence: "entity UUID == benefit_uuid at v3_13 program_master",
      }),
      row({
        entity_id: "d",
        tier: "identity_mirror",
        evidence: "(9)->v3_13 mirror program_master",
      }),
    ]);
    expect(excluded).toHaveLength(0);
    expect(approved).toHaveLength(4);
  });

  it("holds benefits_program_master anchors — the sheet is unverifiable", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({
        entity_id: "a",
        tier: "identity_uuid",
        evidence: "entity UUID == benefit_uuid at v3_13 benefits_program_master",
      }),
      row({
        entity_id: "b",
        tier: "identity_mirror",
        evidence: "(9)->v3_13 mirror benefits_program_master",
      }),
      row({ entity_id: "c", evidence: "some other unverifiable source" }),
    ]);
    expect(approved).toHaveLength(0);
    expect(excluded.map((e) => e.reason)).toEqual([
      "sheet_not_fidelity_cleared",
      "sheet_not_fidelity_cleared",
      "sheet_not_fidelity_cleared",
    ]);
  });

  it("clears only the hand-verified domain-corroborated entity", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({
        entity_id: "b38117aa-0627-4e6b-8214-ac6c621e219b",
        tier: "c_strong",
        new_name: "FL Division of Workers' Compensation",
        evidence: "domain:myfloridacfo.com [luminari-florida-ENRICHED-PASS3-2026.docx]",
      }),
      row({
        entity_id: "11111111-2222-3333-4444-555555555555",
        tier: "c_strong",
        evidence: "domain:example.org [some other docx]",
      }),
    ]);
    expect(approved.map((r) => r.entity_id)).toEqual([
      "b38117aa-0627-4e6b-8214-ac6c621e219b",
    ]);
    expect(excluded.map((e) => e.reason)).toEqual([
      "sheet_not_fidelity_cleared",
    ]);
  });
});

describe("embedded census set", () => {
  const { approved, excluded } = filterApprovedProposals(EMBEDDED);

  it("applies exactly the fidelity-cleared 2,155 rows", () => {
    expect(approved).toHaveLength(2155);
    const byTier = {};
    for (const r of approved) byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
    expect(byTier).toEqual({
      identity_direct: 2139,
      identity_uuid: 14,
      identity_mirror: 1,
      c_strong: 1,
    });
  });

  it("holds exactly the 161 benefits-anchored rows at the fidelity gate", () => {
    expect(excluded).toHaveLength(161);
    for (const e of excluded) {
      expect(e.reason).toBe("sheet_not_fidelity_cleared");
    }
  });

  it("every proposed name passes the person-facing name test", () => {
    for (const r of approved) {
      expect(passesPersonFacingNameTest(r.new_name)).toBe(true);
    }
  });

  it("every census name is one the test currently holds (the repair population)", () => {
    for (const r of approved) {
      expect(passesPersonFacingNameTest(r.old_name)).toBe(false);
    }
  });

  it("reproduces the cleared-subset manifest regardless of row order", () => {
    expect(manifestFor(approved)).toBe(EXPECTED_CLEARED_MANIFEST);
    expect(manifestFor([...approved].reverse())).toBe(
      EXPECTED_CLEARED_MANIFEST,
    );
  });

  it("the raw embedded set still reproduces the census manifest", () => {
    expect(manifestFor(EMBEDDED)).toBe(EXPECTED_CENSUS_MANIFEST);
  });
});
