import { describe, expect, it } from "vitest";

import {
  EVIDENCE_TIERS,
  manifestFor,
  planInserts,
  validatePlan,
} from "./retire-unattributable-rows-core.mjs";
import { loadEmbeddedPlan } from "./apply-unattributable-row-retirements.mjs";

const plan = loadEmbeddedPlan();

describe("embedded retirement plan", () => {
  it("is the enumerated census set: 371 rows across 39 bundles", () => {
    const census = validatePlan(plan);
    expect(census.total).toBe(371);
    expect(census.bundles).toBe(39);
  });

  it("carries the measured evidence tiers", () => {
    const { byTier } = validatePlan(plan);
    expect(byTier).toEqual({
      zip_consistent: 110,
      zip_mismatch: 0,
      zip_unverifiable_no_bundle_zips: 222,
      no_zip_on_row: 39,
    });
  });

  it("has no duplicate (bundle, row) pairs", () => {
    const keys = plan.map((r) => `${r.bundle_entity_id}|${r.row_uid}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only uses known evidence tiers", () => {
    for (const r of plan) expect(EVIDENCE_TIERS).toContain(r.evidence_tier);
  });

  it("manifest is deterministic under reordering", () => {
    const shuffled = [...plan].reverse();
    expect(manifestFor(shuffled)).toBe(manifestFor(plan));
  });
});

describe("validatePlan", () => {
  it("rejects an unknown evidence tier", () => {
    const bad = [
      {
        bundle_entity_id: "b",
        row_uid: "u",
        sheet: "s",
        row_number: 1,
        evidence_tier: "probably_fine",
      },
    ];
    expect(() => validatePlan(bad)).toThrow(/unknown evidence_tier/);
  });

  it("rejects duplicates", () => {
    const row = {
      bundle_entity_id: "b",
      row_uid: "u",
      sheet: "s",
      row_number: 1,
      evidence_tier: "no_zip_on_row",
    };
    expect(() => validatePlan([row, row])).toThrow(/duplicate plan row/);
  });
});

describe("planInserts", () => {
  const rows = [
    { bundle_entity_id: "b1", row_uid: "u1" },
    { bundle_entity_id: "b1", row_uid: "u2" },
    { bundle_entity_id: "b2", row_uid: "u3" },
  ];

  it("plans everything against an empty ledger", () => {
    const { planned, alreadyRetired, heldByReversal } = planInserts(rows, []);
    expect(planned).toHaveLength(3);
    expect(alreadyRetired).toHaveLength(0);
    expect(heldByReversal).toHaveLength(0);
  });

  it("skips retired rows and never re-retires a restored row", () => {
    const ledger = [
      { bundle_entity_id: "b1", row_uid: "u1", status: "retired" },
      { bundle_entity_id: "b1", row_uid: "u2", status: "restored" },
    ];
    const { planned, alreadyRetired, heldByReversal } = planInserts(
      rows,
      ledger,
    );
    expect(planned.map((r) => r.row_uid)).toEqual(["u3"]);
    expect(alreadyRetired.map((r) => r.row_uid)).toEqual(["u1"]);
    expect(heldByReversal.map((r) => r.row_uid)).toEqual(["u2"]);
  });

  it("throws on an unknown ledger status", () => {
    const ledger = [
      { bundle_entity_id: "b1", row_uid: "u1", status: "vanished" },
    ];
    expect(() => planInserts(rows, ledger)).toThrow(/unknown ledger status/);
  });
});
