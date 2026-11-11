// Step-3 Wave A runner tests (vitest).
//
// The derivation determinism requirement is pinned on the derivation
// side: derivation/derive_plan.py was run twice over the same
// artifacts (the Census raw return is a saved artifact it reuses)
// and produced a byte-identical proposals JSON both times —
// sha256 38cc3669e5d50af088c9ef6a9d0c692f43f617f9c629182e1041d5af9fbe3af;
// see step3-apply/test-transcript.txt. These tests pin the runner:
// the embedded plan contract (exactly-once, class membership,
// accounting, manifest), the drift guards, and the write builders
// (including the category-pass lesson: no array-typed params).

import { describe, expect, it } from "vitest";

import {
  HHS_LOCATION_ID,
  PIN_CLASSES,
  PLAN_VERSION,
  buildCorrectionUpdate,
  buildLedgerInsert,
  buildLocationUpdate,
  classifyRows,
  loadEmbeddedProposals,
  manifestFor,
  validatePlan,
} from "./apply-step3-wave-a.mjs";

const doc = loadEmbeddedProposals();
const rows = doc.rows;
const byClass = (c) => rows.filter((r) => r.pin_class === c);
const clone = (o) => JSON.parse(JSON.stringify(o));

describe("embedded plan contract", () => {
  it("validates clean against its own declared inputs", () => {
    expect(validatePlan(doc)).toEqual([]);
  });

  it("carries the v1 counts: 101 pins = 72 repair + 3 ties + 25 MAR + 1 correction", () => {
    expect(rows.length).toBe(101);
    expect(byClass("census_repair").length).toBe(72);
    expect(byClass("census_tie_zip_state").length).toBe(3);
    expect(byClass("dc_mar").length).toBe(25);
    expect(byClass("hhs_state_conflict_correction").length).toBe(1);
    expect(doc.accounting).toMatchObject({
      repair_classified_rows: 155,
      repair_mar_overlap_rows: 1,
      repair_batch_rows: 154,
      repair_planned: 72,
      repair_held: 82,
      planned_total: 101,
    });
    expect(PLAN_VERSION).toBe("step3_wave_a_v1");
    expect(PIN_CLASSES).toEqual([
      "census_repair",
      "census_tie_zip_state",
      "dc_mar",
      "hhs_state_conflict_correction",
    ]);
  });

  it("reproduces the pinned manifest, order-independently", () => {
    expect(doc.expected_manifest_sha256).toBe(
      "533d14170c8cf3ac52754d9d96081774ec92ba4fde03699c492d864afff3a831",
    );
    expect(manifestFor(rows)).toBe(doc.expected_manifest_sha256);
    expect(manifestFor([...rows].reverse())).toBe(doc.expected_manifest_sha256);
  });

  it("plans every location exactly once; MAR and HHS rows included once each", () => {
    const ids = rows.map((r) => r.location_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of doc.inputs.mar_ids) {
      expect(ids.filter((x) => x === id).length).toBe(1);
    }
    expect(ids.filter((x) => x === HHS_LOCATION_ID).length).toBe(1);
    const overlap = doc.inputs.mar_overlap_repair_ids;
    expect(overlap.length).toBe(1);
    const overlapRow = rows.find((r) => r.location_id === overlap[0]);
    expect(overlapRow.pin_class).toBe("dc_mar");
  });

  it("excludes the held repair rows and everything outside the four input sets", () => {
    const planIds = new Set(rows.map((r) => r.location_id));
    for (const h of doc.held) expect(planIds.has(h.location_id)).toBe(false);
    const union = new Set([
      ...doc.inputs.repair_ids,
      ...doc.inputs.tie_ids,
      ...doc.inputs.mar_ids,
      doc.inputs.hhs_id,
    ]);
    // 155 + 3 + 25 + 1 memberships, one overlap -> 183 unique inputs.
    expect(union.size).toBe(183);
    for (const id of planIds) expect(union.has(id)).toBe(true);
    // The unproven repair rules and the held No_Match classes never
    // fed any input set: repair inputs are exactly the 155 rows the
    // triage classified under the two proven rules (count pinned in
    // the derivation report against the triage CSVs).
    expect(doc.inputs.repair_ids.length).toBe(155);
  });

  it("gives every census_repair row a proven rule, tagged in its provenance", () => {
    for (const r of byClass("census_repair")) {
      expect(["R-SPLIT-SEGMENT", "R-DROP-PREFIX"]).toContain(r.repair_rule);
      expect(r.provenance).toBe(`census_batch_repair:${r.repair_rule}`);
      expect(["census_match_exact", "census_match_non_exact"]).toContain(
        r.coordinate_quality,
      );
    }
    const byRule = {};
    for (const r of byClass("census_repair")) {
      byRule[r.repair_rule] = (byRule[r.repair_rule] ?? 0) + 1;
    }
    expect(byRule).toEqual({ "R-DROP-PREFIX": 42, "R-SPLIT-SEGMENT": 30 });
  });

  it("shapes the HHS correction exactly (location only, MAR coordinates)", () => {
    const hhs = byClass("hhs_state_conflict_correction")[0];
    expect(hhs.location_id).toBe(HHS_LOCATION_ID);
    expect(hhs.correction).toEqual({
      old_state: "WA",
      new_state: "DC",
      old_city: null,
      new_city: "Washington",
    });
    expect(hhs.latitude).toBe("38.886876");
    expect(hhs.longitude).toBe("-77.014394");
    expect(hhs.geocode_source).toContain("MAR_ID 291713");
  });

  it("rejects a plan row outside the input sets (exclusion by construction)", () => {
    const bad = clone(doc);
    bad.rows.push({
      ...clone(rows[0]),
      location_id: "00000000-0000-4000-8000-000000000000",
    });
    const errors = validatePlan(bad);
    expect(errors.some((e) => e.includes("not in that class's input set"))).toBe(true);
    expect(errors.some((e) => e.includes("duplicate") || e.includes("manifest"))).toBe(true);
  });

  it("rejects a duplicated MAR row and a tampered correction", () => {
    const dup = clone(doc);
    dup.rows.push(clone(byClass("dc_mar")[0]));
    expect(
      validatePlan(dup).some((e) => e.includes("duplicate location")),
    ).toBe(true);
    const tampered = clone(doc);
    tampered.rows.find(
      (r) => r.pin_class === "hhs_state_conflict_correction",
    ).correction.new_state = "WA";
    expect(
      validatePlan(tampered).some((e) => e.includes("correction shape")),
    ).toBe(true);
  });

  it("rejects a plan that drops the MAR/repair overlap row", () => {
    const dropped = clone(doc);
    const overlap = doc.inputs.mar_overlap_repair_ids[0];
    dropped.rows = dropped.rows.filter((r) => r.location_id !== overlap);
    expect(
      validatePlan(dropped).some((e) => e.includes("missing from plan")),
    ).toBe(true);
  });
});

describe("classifyRows — drift guards", () => {
  const currentFor = (overrides = {}) =>
    rows.map((r) => ({
      location_id: r.location_id,
      resource_entity_id: r.resource_entity_id,
      latitude: null,
      longitude: null,
      coordinate_quality: "not_geocoded_projection",
      geocode_source: null,
      state: r.pin_class === "hhs_state_conflict_correction" ? "WA" : "XX",
      city: null,
      ...overrides[r.location_id],
    }));

  it("plans all 101 rows against the untouched held state", () => {
    const { planned, alreadyApplied, drift, missing } = classifyRows(rows, currentFor());
    expect(planned.length).toBe(101);
    expect(alreadyApplied.length).toBe(0);
    expect(drift.length).toBe(0);
    expect(missing.length).toBe(0);
    // planned rows carry their current row for the ledger's old values
    expect(planned[0].current.coordinate_quality).toBe("not_geocoded_projection");
  });

  it("counts a row already carrying the plan pin as already_applied", () => {
    const target = byClass("dc_mar")[0];
    const { planned, alreadyApplied } = classifyRows(
      rows,
      currentFor({
        [target.location_id]: { latitude: target.latitude, longitude: target.longitude },
      }),
    );
    expect(alreadyApplied.map((r) => r.location_id)).toEqual([target.location_id]);
    expect(planned.length).toBe(100);
  });

  it("counts the correction as applied only when pin AND state/city match", () => {
    const hhs = byClass("hhs_state_conflict_correction")[0];
    const pinOnly = classifyRows(
      rows,
      currentFor({
        [HHS_LOCATION_ID]: { latitude: hhs.latitude, longitude: hhs.longitude },
      }),
    );
    expect(pinOnly.alreadyApplied.length).toBe(0);
    expect(pinOnly.drift.map((d) => d.location_id)).toEqual([HHS_LOCATION_ID]);
    const full = classifyRows(
      rows,
      currentFor({
        [HHS_LOCATION_ID]: {
          latitude: hhs.latitude,
          longitude: hhs.longitude,
          state: "DC",
          city: "Washington",
        },
      }),
    );
    expect(full.alreadyApplied.map((r) => r.location_id)).toEqual([HHS_LOCATION_ID]);
  });

  it("drifts on foreign coordinates, on a moved HHS state, and reports missing", () => {
    const tie = byClass("census_tie_zip_state")[0];
    const res = classifyRows(
      rows,
      currentFor({
        [tie.location_id]: { latitude: "1.5", longitude: "2.5" },
        [HHS_LOCATION_ID]: { state: "US" },
      }).filter((c) => c.location_id !== rows[0].location_id),
    );
    expect(res.drift.map((d) => d.location_id).sort()).toEqual(
      [tie.location_id, HHS_LOCATION_ID].sort(),
    );
    expect(res.missing).toEqual([rows[0].location_id]);
    expect(res.planned.length).toBe(98);
  });
});

describe("write builders", () => {
  const planned = classifyRows(
    rows,
    rows.map((r) => ({
      location_id: r.location_id,
      resource_entity_id: r.resource_entity_id,
      latitude: null,
      longitude: null,
      coordinate_quality: "not_geocoded_projection",
      geocode_source: null,
      state: r.pin_class === "hhs_state_conflict_correction" ? "WA" : "XX",
      city: null,
    })),
  ).planned;

  it("builds the pin update for the 100 non-correction rows, guard re-checked", () => {
    const built = buildLocationUpdate(planned);
    expect(built.text).toContain("l.latitude is null");
    expect(built.text).toContain("update public.luminari_resource_locations");
    expect((built.text.match(/::uuid/g) ?? []).length).toBe(100);
    expect(built.params.length).toBe(500);
    // the category-pass lesson: every param is a scalar — no arrays
    expect(built.params.every((p) => !Array.isArray(p))).toBe(true);
    expect(
      built.params.filter((p) => p === HHS_LOCATION_ID).length,
    ).toBe(0);
  });

  it("returns null for a correction-only update set", () => {
    const hhsOnly = planned.filter(
      (r) => r.pin_class === "hhs_state_conflict_correction",
    );
    expect(buildLocationUpdate(hhsOnly)).toBeNull();
  });

  it("builds the correction update with its state/city guard", () => {
    const hhs = planned.find(
      (r) => r.pin_class === "hhs_state_conflict_correction",
    );
    const built = buildCorrectionUpdate(hhs);
    expect(built.text).toContain("state = $8");
    expect(built.text).toContain("city is null");
    expect(built.text).toContain("latitude is null");
    expect(built.params).toEqual([
      HHS_LOCATION_ID,
      "38.886876",
      "-77.014394",
      "dc_mar_match",
      hhs.geocode_source,
      "DC",
      "Washington",
      "WA",
    ]);
    expect(buildCorrectionUpdate(planned[0])).toBeNull();
  });

  it("builds the ledger insert: 18 scalar params per row, old values from current", () => {
    const manifest = doc.expected_manifest_sha256;
    const built = buildLedgerInsert(planned, manifest);
    expect(built.text).toContain("insert into public.luminari_step3_wavea_pins");
    expect(built.text).toContain("on conflict (location_id) do nothing");
    expect(built.params.length).toBe(101 * 18);
    expect(built.params.every((p) => !Array.isArray(p))).toBe(true);
    const hhsIdx = planned.findIndex(
      (r) => r.pin_class === "hhs_state_conflict_correction",
    );
    const base = hhsIdx * 18;
    expect(built.params[base + 10]).toBe("not_geocoded_projection"); // old quality
    expect(built.params[base + 11]).toBeNull(); // old geocode_source
    expect(built.params[base + 12]).toBe("WA");
    expect(built.params[base + 13]).toBe("DC");
    expect(built.params[base + 14]).toBeNull();
    expect(built.params[base + 15]).toBe("Washington");
    expect(built.params[base + 16]).toBe(manifest);
    expect(built.params[base + 17]).toBe(PLAN_VERSION);
    // non-correction rows carry no state/city change
    const marIdx = planned.findIndex((r) => r.pin_class === "dc_mar");
    expect(built.params[marIdx * 18 + 12]).toBeNull();
    expect(built.params[marIdx * 18 + 13]).toBeNull();
  });
});
