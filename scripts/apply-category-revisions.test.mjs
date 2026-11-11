import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPROVED_TIERS,
  CANONICAL_CATEGORIES,
  LEDGER_COLUMNS,
  PASS_VERSION,
  buildEntityUpdate,
  buildLedgerInsert,
  evidenceIsUnverifiableAnchored,
  filterApprovedProposals,
  manifestFor,
  planClassifications,
  sheetTokensOf,
} from "./apply-category-revisions.mjs";

// The embedded apply set is the census derivation, staged into the
// repo so the run is reproducible from the repo alone. These tests
// hold it to the pass's declared rules: clean tiers only, canonical
// vocabulary, the workbook-fidelity guards re-checked with
// TOKEN-based sheet attribution, and the manifest the production
// dry run must reproduce.
const EMBEDDED = JSON.parse(
  readFileSync(
    new URL("./category-pass-proposals-v1.json", import.meta.url),
    "utf-8",
  ),
);
const EXPECTED_MANIFEST =
  "3e1bd3c36d41475b9d0c0961e2987e8520bde3d5b1d1a880bb42449d09b4a2a5";

const row = (overrides = {}) => ({
  entity_id: "11111111-2222-3333-4444-555555555555",
  canonical_id: "crp_wa_00000000000000000000",
  resource_name: "Example Crisis Center",
  state: "WA",
  primary_category: "housing",
  primary_tier: "R4",
  primary_evidence:
    "description 'emergency shelter' in \"Emergency shelter and rent help\" @ xlsx:resource_master:row:10",
  primary_quote: "emergency shelter",
  memberships: [],
  civic_object_uid: "corpus:abc",
  object_ref: "abc",
  artifact_key: "State Enriched Registry bucket/luminari_resource_directory_v3_13.xlsx",
  source_locator: "xlsx:resource_master:row:10",
  before_category: "workbook_record",
  before_layer: "backbone_workbook",
  source_text: "Example Crisis Center",
  ...overrides,
});

const mem = (category, evidence, overrides = {}) => ({
  category,
  tier: "R4",
  tiers: ["R4"],
  tag_only: false,
  evidence: Array.isArray(evidence) ? evidence : [evidence],
  ...overrides,
});

describe("tier filter", () => {
  it("approves exactly the clean census tiers", () => {
    expect(APPROVED_TIERS).toEqual(["R2", "R3a_workbook", "R4"]);
  });

  it("excludes view-label primaries, conflicts, and incomplete rows", () => {
    const { approved, excluded } = filterApprovedProposals([
      row(),
      row({ entity_id: "a", primary_tier: "R3a_view" }),
      row({ entity_id: "b", primary_tier: "R1" }),
      row({ entity_id: "c", primary_category: null }),
      row({ entity_id: "d", primary_evidence: "" }),
    ]);
    expect(approved).toHaveLength(1);
    expect(excluded.map((e) => e.reason)).toEqual([
      "tier_not_approved",
      "tier_not_approved",
      "missing_fields",
      "missing_fields",
    ]);
  });

  it("excludes non-canonical primaries and memberships — legacy labels never map silently", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({ entity_id: "a", primary_category: "veterans" }),
      row({ entity_id: "b", primary_category: "general_resource" }),
      row({
        entity_id: "c",
        memberships: [mem("disability", "R4: description 'x' @ lines:1-2")],
      }),
      row({
        entity_id: "d",
        memberships: [mem("housing", "R4: description 'x' @ lines:1-2")],
      }),
    ]);
    expect(approved).toHaveLength(0);
    expect(excluded.map((e) => e.reason)).toEqual([
      "primary_not_canonical",
      "primary_not_canonical",
      "membership_not_canonical",
      "membership_not_canonical",
    ]);
  });
});

describe("fidelity guards — token-based sheet attribution", () => {
  it("parses sheet tokens exactly: benefits_program_master is not program_master", () => {
    expect([
      ...sheetTokensOf("label 'x' @ xlsx:benefits_program_master:row:9"),
    ]).toEqual(["benefits_program_master"]);
    expect([...sheetTokensOf("label 'x' @ xlsx:program_master:row:9")]).toEqual(
      ["program_master"],
    );
    expect(evidenceIsUnverifiableAnchored("@ xlsx:program_master:row:9")).toBe(
      false,
    );
    expect(
      evidenceIsUnverifiableAnchored("@ xlsx:benefits_program_master:row:9"),
    ).toBe(true);
    // the trap in the other direction: the UNVERIFIABLE token
    // 'programs' must not catch the FAITHFUL 'program_master'
    expect([...sheetTokensOf("label 'x' @ xlsx:programs:row:9")]).toEqual([
      "programs",
    ]);
    expect(evidenceIsUnverifiableAnchored("@ xlsx:programs:row:9")).toBe(true);
    // the word alone, without a locator token, is not an anchor
    expect(
      evidenceIsUnverifiableAnchored("see benefits_program_master notes"),
    ).toBe(false);
  });

  it("holds unverifiable-anchored primaries — no sheet-name exceptions", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({
        entity_id: "a",
        primary_evidence:
          "wb:service_type 'cash assistance' in \"Cash help\" @ xlsx:benefits_program_master:row:260",
      }),
      row({
        entity_id: "b",
        primary_evidence:
          "wb:service_type 'cash assistance' in \"Cash help\" @ xlsx:program_master:row:260",
      }),
      row({
        entity_id: "c",
        primary_evidence:
          "description 'cash assistance' in \"Cash help\" @ xlsx:master_template_program:row:12",
      }),
      row({
        entity_id: "d",
        primary_evidence:
          "description 'cash assistance' in \"Cash help\" @ xlsx:wa_resource_directory:row:40",
      }),
    ]);
    expect(approved.map((r) => r.entity_id)).toEqual(["b"]);
    expect(excluded).toEqual([
      { entity_id: "a", reason: "unverifiable_sheet_primary" },
      { entity_id: "c", reason: "unverifiable_sheet_primary" },
      { entity_id: "d", reason: "unverifiable_sheet_primary" },
    ]);
  });

  it("strips unverifiable-anchored membership evidence and drops evidenceless memberships", () => {
    const { approved, droppedMemberships, strippedEvidenceStrings } =
      filterApprovedProposals([
        row({
          memberships: [
            mem("utilities", [
              "workbook master_template_program.benefit_categories tag 'utilities' @ xlsx:master_template_program:row:260",
              "R4: description 'energy assistance' in \"Energy assistance\" @ lines:5-9",
            ]),
            mem("tribal", [
              "workbook wa_registry_program.benefit_categories tag 'tribal' @ xlsx:wa_registry_program:row:260",
            ]),
          ],
        }),
      ]);
    expect(approved).toHaveLength(1);
    expect(approved[0].memberships).toHaveLength(1);
    expect(approved[0].memberships[0].category).toBe("utilities");
    expect(approved[0].memberships[0].evidence).toHaveLength(1);
    expect(droppedMemberships).toBe(1);
    expect(strippedEvidenceStrings).toBe(2);
  });

  it("drops an unverifiable-anchored membership while a program_master-anchored sibling survives", () => {
    const { approved, droppedMemberships, strippedEvidenceStrings } =
      filterApprovedProposals([
        row({
          memberships: [
            mem("tribal", [
              "workbook substrate_az_program.category_tags tag 'tribal' @ xlsx:substrate_az_program:row:88",
            ]),
            mem("healthcare", [
              "workbook program_master.category_tags tag 'healthcare' @ xlsx:program_master:row:88",
            ]),
          ],
        }),
      ]);
    expect(approved).toHaveLength(1);
    expect(approved[0].memberships).toHaveLength(1);
    expect(approved[0].memberships[0].category).toBe("healthcare");
    expect(approved[0].memberships[0].evidence).toEqual([
      "workbook program_master.category_tags tag 'healthcare' @ xlsx:program_master:row:88",
    ]);
    expect(droppedMemberships).toBe(1);
    expect(strippedEvidenceStrings).toBe(1);
  });

  it("excludes entities whose only evidence sits on LOSSY sheets", () => {
    const { approved, excluded } = filterApprovedProposals([
      row({
        entity_id: "a",
        primary_evidence:
          "description 'emergency shelter' in \"Shelter\" @ xlsx:bucket_resource:row:3",
        memberships: [
          mem(
            "utilities",
            "R4: description 'energy assistance' in \"Help\" @ xlsx:registry_programs:row:8",
          ),
        ],
      }),
      row({
        entity_id: "b",
        primary_evidence:
          "description 'emergency shelter' in \"Shelter\" @ xlsx:bucket_resource:row:3",
        memberships: [
          mem(
            "utilities",
            "R4: description 'energy assistance' in \"Help\" @ lines:5-9",
          ),
        ],
      }),
    ]);
    expect(approved.map((r) => r.entity_id)).toEqual(["b"]);
    expect(excluded).toEqual([
      { entity_id: "a", reason: "lossy_sheet_only_evidence" },
    ]);
  });
});

describe("drift guard", () => {
  const approved = [
    row({ entity_id: "planned" }),
    row({
      entity_id: "done",
      primary_category: "legal_civil_rights",
      memberships: [mem("housing", "e"), mem("utilities", "e")],
    }),
    row({ entity_id: "moved", primary_category: "tribal" }),
    row({ entity_id: "gone", primary_category: "tribal" }),
  ];

  it("plans only rows whose current category is still NULL", () => {
    const { planned, alreadyApplied, drift, missing } = planClassifications(
      approved,
      [
        {
          resource_entity_id: "planned",
          resource_category: null,
          service_categories: [],
        },
        {
          resource_entity_id: "done",
          resource_category: "legal_civil_rights",
          service_categories: ["utilities", "housing"],
        },
        {
          resource_entity_id: "moved",
          resource_category: "healthcare",
          service_categories: [],
        },
      ],
    );
    expect(planned.map((r) => r.entity_id)).toEqual(["planned"]);
    expect(alreadyApplied).toEqual(["done"]);
    expect(drift).toEqual([
      {
        entity_id: "moved",
        proposed_category: "tribal",
        found_category: "healthcare",
        found_memberships: [],
      },
    ]);
    expect(missing).toEqual(["gone"]);
  });
});

describe("write builders", () => {
  it("builds a conflict-guarded ledger insert aligned to the migration", () => {
    const built = buildLedgerInsert([
      row(),
      row({ entity_id: "x", memberships: [mem("utilities", "e")] }),
    ]);
    expect(built.text).toContain(
      "insert into public.luminari_category_pass_classifications",
    );
    expect(built.text).toContain(LEDGER_COLUMNS.join(", "));
    expect(built.text).toContain(
      "on conflict (resource_entity_id) do nothing",
    );
    expect(built.params).toHaveLength(2 * LEDGER_COLUMNS.length);
    expect(built.params[10]).toBe(PASS_VERSION);
    // memberships ride as a JSON string bound for the jsonb column
    expect(JSON.parse(built.params[16])).toEqual([
      expect.objectContaining({ category: "utilities" }),
    ]);
    expect(buildLedgerInsert([])).toBeNull();
  });

  it("builds an entity update that re-checks the drift guard at write time", () => {
    const built = buildEntityUpdate([
      row({ memberships: [mem("utilities", "e"), mem("housing", "e")] }),
    ]);
    expect(built.text).toContain("update public.luminari_resource_entities e");
    expect(built.text).toContain("set resource_category = v.primary_category");
    expect(built.text).toContain("e.resource_category is null");
    // per-row VALUES tuples with flattened params — the step-4
    // buildEntityInsert shape, NOT parallel unnest arrays
    expect(built.text).toContain("(values");
    expect(built.text).toContain("$1::uuid");
    expect(built.text).toContain("$3::text[]");
    expect(built.params).toEqual([
      row().entity_id,
      "housing",
      // memberships only, sorted — the shape the categorized
      // remainder entities already carry (primary is NOT repeated)
      ["housing", "utilities"],
    ]);
    expect(buildEntityUpdate([])).toBeNull();
  });

  // The production --apply failure (2026-11-11, SQLSTATE 42804) was
  // a param-TYPE bug the SQL-string assertions above could not see:
  // the memberships rode as ONE text[][] param through unnest(),
  // which flattens a 2-D array to its scalar element type in a
  // select list, so the value reaching the text[] column was text.
  // These tests pin the TYPES of the params handed to pg: flat,
  // one membership slot per row, each a JS string array. Any return
  // to an array-of-arrays param fails here before it ships.
  it("hands pg flat params — membership slots are string arrays, never nested", () => {
    const built = buildEntityUpdate([
      row({
        entity_id: "e-two",
        memberships: [mem("utilities", "e"), mem("housing", "e")],
      }),
      row({ entity_id: "e-none", memberships: [] }),
      row({
        entity_id: "e-one",
        primary_category: "tribal",
        memberships: [mem("healthcare", "e")],
      }),
    ]);
    expect(built.params).toHaveLength(9);
    // NO param is an array of arrays — the exact production trap
    for (const p of built.params) {
      if (Array.isArray(p)) {
        for (const el of p) expect(Array.isArray(el)).toBe(false);
      }
    }
    // membership slots (every third param): real JS arrays of
    // strings — pg serializes each into a text[] value under the
    // $n::text[] cast; the empty-membership row is a real empty
    // array, not [[]] or [""]
    expect(built.params[2]).toEqual(["housing", "utilities"]);
    expect(built.params[5]).toEqual([]);
    expect(built.params[8]).toEqual(["healthcare"]);
    for (const slot of [built.params[2], built.params[5], built.params[8]]) {
      expect(Array.isArray(slot)).toBe(true);
      for (const el of slot) expect(typeof el).toBe("string");
    }
    // id + primary slots stay scalar
    expect(built.params[0]).toBe("e-two");
    expect(built.params[1]).toBe("housing");
    expect(built.params[6]).toBe("e-one");
    expect(built.params[7]).toBe("tribal");
    // the flattened-select-list unnest shape stays out by name
    expect(built.text).not.toContain("unnest(");
    expect(built.text).not.toContain("text[][]");
  });

  it("pins the ledger columns and vocabularies to the migration that creates the table", () => {
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20261110230000_category_pass_ledger_v1.sql",
        import.meta.url,
      ),
      "utf-8",
    );
    expect(migration).toContain(
      "create table if not exists public.luminari_category_pass_classifications",
    );
    for (const column of LEDGER_COLUMNS) {
      expect(migration).toContain(column);
    }
    for (const tier of APPROVED_TIERS) {
      expect(migration).toContain(`'${tier}'`);
    }
    for (const category of CANONICAL_CATEGORIES) {
      expect(migration).toContain(`'${category}'`);
    }
  });
});

describe("embedded census set", () => {
  const { approved, excluded, droppedMemberships } =
    filterApprovedProposals(EMBEDDED);

  it("applies exactly the 1,683 clean-tier entities in census tier counts", () => {
    expect(excluded).toHaveLength(0);
    expect(approved).toHaveLength(1683);
    const byTier = {};
    for (const r of approved) byTier[r.primary_tier] = (byTier[r.primary_tier] ?? 0) + 1;
    expect(byTier).toEqual({ R2: 343, R3a_workbook: 48, R4: 1292 });
  });

  it("carries 1,465 memberships, 1,129 of them tag-grade R3b (applied, tier recorded)", () => {
    const mems = approved.flatMap((r) => r.memberships);
    expect(mems).toHaveLength(1465);
    expect(mems.filter((m) => m.tag_only)).toHaveLength(1129);
    expect(droppedMemberships).toBe(0);
  });

  it("every primary and membership is canonical, distinct, and evidence-backed", () => {
    for (const r of approved) {
      expect(CANONICAL_CATEGORIES).toContain(r.primary_category);
      expect(r.primary_evidence.length).toBeGreaterThan(0);
      const cats = r.memberships.map((m) => m.category);
      expect(new Set(cats).size).toBe(cats.length);
      expect(cats).not.toContain(r.primary_category);
      for (const m of r.memberships) {
        expect(CANONICAL_CATEGORIES).toContain(m.category);
        expect(m.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("no applied evidence string is unverifiable-anchored (fidelity gate, re-checked)", () => {
    for (const r of approved) {
      expect(evidenceIsUnverifiableAnchored(r.primary_evidence)).toBe(false);
      for (const m of r.memberships) {
        for (const ev of m.evidence) {
          expect(evidenceIsUnverifiableAnchored(ev)).toBe(false);
        }
      }
    }
  });

  it("reproduces the census manifest regardless of row order", () => {
    expect(manifestFor(approved)).toBe(EXPECTED_MANIFEST);
    expect(manifestFor([...approved].reverse())).toBe(EXPECTED_MANIFEST);
  });
});
