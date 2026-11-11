import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPROVED_TIERS,
  CANONICAL_CATEGORIES,
  LEDGER_COLUMNS,
  PASS_VERSION,
  buildEntityUpdate,
  buildLedgerInsert,
  evidenceIsBenefitsAnchored,
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
  "a0904191747d89a5e8c7c391c17f6c0378bc5f7dc1b9afdee31a401560226dc9";

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
    expect(evidenceIsBenefitsAnchored("@ xlsx:program_master:row:9")).toBe(
      false,
    );
    expect(
      evidenceIsBenefitsAnchored("@ xlsx:benefits_program_master:row:9"),
    ).toBe(true);
    // the word alone, without a locator token, is not an anchor
    expect(evidenceIsBenefitsAnchored("see benefits_program_master notes")).toBe(
      false,
    );
  });

  it("holds benefits-anchored primaries — the sheet is unverifiable", () => {
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
    ]);
    expect(approved.map((r) => r.entity_id)).toEqual(["b"]);
    expect(excluded).toEqual([
      { entity_id: "a", reason: "benefits_anchored_evidence" },
    ]);
  });

  it("strips benefits-anchored membership evidence and drops evidenceless memberships", () => {
    const { approved, droppedMemberships, strippedEvidenceStrings } =
      filterApprovedProposals([
        row({
          memberships: [
            mem("utilities", [
              "workbook benefits_program_master.benefit_categories tag 'utilities' @ xlsx:benefits_program_master:row:260",
              "R4: description 'energy assistance' in \"Energy assistance\" @ lines:5-9",
            ]),
            mem("tribal", [
              "workbook benefits_program_master.benefit_categories tag 'tribal' @ xlsx:benefits_program_master:row:260",
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
    expect(built.params[0]).toEqual([row().entity_id]);
    expect(built.params[1]).toEqual(["housing"]);
    // memberships only, sorted — the shape the categorized remainder
    // entities already carry (primary is NOT repeated)
    expect(built.params[2]).toEqual([["housing", "utilities"]]);
    expect(buildEntityUpdate([])).toBeNull();
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

  it("applies exactly the 1,777 clean-tier entities in census tier counts", () => {
    expect(excluded).toHaveLength(0);
    expect(approved).toHaveLength(1777);
    const byTier = {};
    for (const r of approved) byTier[r.primary_tier] = (byTier[r.primary_tier] ?? 0) + 1;
    expect(byTier).toEqual({ R2: 343, R3a_workbook: 51, R4: 1383 });
  });

  it("carries 1,476 memberships, 1,129 of them tag-grade R3b (applied, tier recorded)", () => {
    const mems = approved.flatMap((r) => r.memberships);
    expect(mems).toHaveLength(1476);
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

  it("no applied evidence string is benefits-anchored (fidelity gate, re-checked)", () => {
    for (const r of approved) {
      expect(evidenceIsBenefitsAnchored(r.primary_evidence)).toBe(false);
      for (const m of r.memberships) {
        for (const ev of m.evidence) {
          expect(evidenceIsBenefitsAnchored(ev)).toBe(false);
        }
      }
    }
  });

  it("reproduces the census manifest regardless of row order", () => {
    expect(manifestFor(approved)).toBe(EXPECTED_MANIFEST);
    expect(manifestFor([...approved].reverse())).toBe(EXPECTED_MANIFEST);
  });
});
