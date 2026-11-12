import { describe, it, expect } from "vitest";
import {
  REPAIR_VERSION,
  EXPECTED_PLAN_MANIFEST,
  filterApprovedProposals,
  planRepairs,
  manifestFor,
  passesPersonFacingNameTest,
  buildRenameLedgerInsert,
  buildClearLedgerInsert,
  buildNameUpdate,
  buildClearUpdate,
  loadEmbeddedProposals,
} from "./apply-title-hygiene.mjs";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

describe("embedded proposals", () => {
  it("approve exactly the reviewed plan, manifest pinned", () => {
    const { approvedRenames, approvedClears, excluded } =
      filterApprovedProposals(loadEmbeddedProposals());
    expect(approvedRenames.length).toBe(416);
    expect(approvedClears.length).toBe(233);
    expect(excluded).toEqual([]);
    expect(manifestFor(approvedRenames, approvedClears)).toBe(
      EXPECTED_PLAN_MANIFEST,
    );
    expect(REPAIR_VERSION).toBe("title_hygiene_v1");
  });

  it("every approved new name passes the widened name test", () => {
    const { approvedRenames } = filterApprovedProposals(loadEmbeddedProposals());
    for (const r of approvedRenames)
      expect(passesPersonFacingNameTest(r.new_name)).toBe(true);
  });
});

describe("filter", () => {
  it("excludes a rename the transforms do not re-derive", () => {
    const { approvedRenames, excluded } = filterApprovedProposals({
      renames: [
        {
          entity_id: ID1,
          old_name: "ACLU of Guam [ACLU-GU] ★",
          new_name: "Invented Name",
          rule: "D1-bracket-strip",
        },
      ],
      clears: [],
    });
    expect(approvedRenames).toEqual([]);
    expect(excluded[0].reason).toBe("rederivation_mismatch");
  });

  it("excludes a clear whose old value is prose, not a filename", () => {
    const { approvedClears, excluded } = filterApprovedProposals({
      renames: [],
      clears: [
        {
          entity_id: ID1,
          fields: [{ field: "description", old_value: "Real prose." }],
        },
      ],
    });
    expect(approvedClears).toEqual([]);
    expect(excluded[0].reason).toBe("old_value_not_bare_filename");
  });

  it("excludes a clear on a non-clearable field", () => {
    const { excluded } = filterApprovedProposals({
      renames: [],
      clears: [
        {
          entity_id: ID1,
          fields: [{ field: "resource_name", old_value: "x.docx" }],
        },
      ],
    });
    expect(excluded[0].reason).toBe("missing_fields");
  });
});

describe("plan (drift guard)", () => {
  const renames = [
    { entity_id: ID1, old_name: "ACLU of Guam [ACLU-GU] ★", new_name: "ACLU of Guam", rule: "D1-bracket-strip" },
    { entity_id: ID2, old_name: "08625 — NJ DHS", new_name: "NJ DHS", rule: "B1-zip-strip" },
  ];
  const clears = [
    { entity_id: ID1, field: "description", old_value: "luminari-x.docx" },
  ];
  it("classifies planned / already-applied / drift / missing", () => {
    const plan = planRepairs(renames, clears, [
      { resource_entity_id: ID1, resource_name: "ACLU of Guam [ACLU-GU] ★", description: null },
      { resource_entity_id: ID2, resource_name: "Something Else", description: null },
    ]);
    expect(plan.renames.planned.map((r) => r.entity_id)).toEqual([ID1]);
    expect(plan.renames.drift.map((r) => r.entity_id)).toEqual([ID2]);
    expect(plan.clears.alreadyApplied.length).toBe(1);
  });
  it("counts a rename already at its new name as already applied", () => {
    const plan = planRepairs(renames, [], [
      { resource_entity_id: ID1, resource_name: "ACLU of Guam", description: null },
      { resource_entity_id: ID2, resource_name: "NJ DHS", description: null },
    ]);
    expect(plan.renames.alreadyApplied).toEqual([ID1, ID2]);
    expect(plan.renames.planned).toEqual([]);
  });
});

describe("builders", () => {
  it("rename ledger insert is conflict-guarded on (entity, kind, field)", () => {
    const built = buildRenameLedgerInsert([
      { entity_id: ID1, old_name: "A [X] ★", new_name: "A", rule: "D1-bracket-strip" },
    ]);
    expect(built.text).toContain("on conflict (resource_entity_id, repair_kind, field_name) do nothing");
    expect(built.params).toContain("title_rename");
  });
  it("name update re-checks the old name in its WHERE clause", () => {
    const built = buildNameUpdate([
      { entity_id: ID1, old_name: "A [X] ★", new_name: "A" },
    ]);
    expect(built.text).toContain("e.resource_name = v.old_name");
  });
  it("clear update refuses a non-clearable field", () => {
    expect(() =>
      buildClearUpdate("resource_name", [{ entity_id: ID1, old_value: "x.docx" }]),
    ).toThrow();
  });
  it("builders return null on empty input", () => {
    expect(buildRenameLedgerInsert([])).toBeNull();
    expect(buildClearLedgerInsert([])).toBeNull();
    expect(buildNameUpdate([])).toBeNull();
    expect(buildClearUpdate("description", [])).toBeNull();
  });
});

describe("widened name test mirror", () => {
  it("rejects every census shape and accepts repaired names", () => {
    expect(passesPersonFacingNameTest("08625 — NJ Department of Human Services")).toBe(false);
    expect(passesPersonFacingNameTest("ACLU of Guam [ACLU-GU] ★")).toBe(false);
    expect(passesPersonFacingNameTest("10225 Grand Avenue, Franklin Park, IL 60131")).toBe(false);
    expect(passesPersonFacingNameTest("1-800-QUIT-NOW (Quitlines)")).toBe(false);
    expect(passesPersonFacingNameTest("ACLU of Guam")).toBe(true);
    expect(passesPersonFacingNameTest("603 Legal Aid — Statewide Centralized Intake Gateway")).toBe(true);
    expect(passesPersonFacingNameTest("National Network of Tobacco Cessation Quitlines (1-800-QUIT-NOW)")).toBe(true);
  });
});
