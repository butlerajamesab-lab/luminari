import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), resolve: vi.fn(), owner_id: 7, select: vi.fn() }));
vi.mock("./db", () => ({
  getPool: () => ({ query: mocks.query }),
  db: {
    select: mocks.select,
    update: () => ({ set: () => ({ where: async () => [] }) }),
    delete: () => ({ where: async () => [] }),
    insert: () => ({ values: async () => [] }),
  },
}));
vi.mock("./legal-reference-runtime", async import_original => ({
  ...await import_original<typeof import("./legal-reference-runtime")>(), resolve_legal_reference: mocks.resolve,
}));
import { caseStateRouter } from "./routers/case-state";

beforeEach(() => {
  mocks.owner_id = 7;
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
  mocks.resolve.mockReset().mockImplementation(async ref => ({ committed_ref: ref, status: "resolved", record: {} }));
  mocks.select.mockReset().mockImplementation(fields => ({ from: () => ({ where: async () => fields
    ? [{ id: 41, user_id: mocks.owner_id }]
    : [{ caseId: 41, userId: 7, committedFindingIds: [], committedBarrierIds: [], committedBenefitIds: [],
      committedSignalIds: [], committedStatuteIds: [7, "case_law:7"], committedFoiaIds: [], committedFilingIds: [] }],
  }) }));
});

it.each(["enforcement", "settlement_formula"] as const)("saves, reads and removes %s under its qualified identity", async kind => {
  const caller = caseStateRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  const ref = `${kind}:7`;
  await expect(caller.commit_source_reference({ case_id: 41, kind, source_id: "7" })).resolves.toMatchObject({ committed_ref: ref, kind });
  expect(mocks.resolve).toHaveBeenCalledWith(ref);
  expect(mocks.query.mock.calls[0][1]).toEqual([41, ref, expect.any(Number), 7]);
  expect(mocks.query.mock.calls[0][0]).toContain("|| jsonb_build_array($2::text)");
  mocks.query.mockResolvedValueOnce({ rows: [{ committed_statute_ids: [7, "case_law:7", ref] }] });
  const readback = await caller.get_legal_references({ case_id: 41 });
  expect(readback.items.map(item => item.committed_ref)).toEqual([7, "case_law:7", ref]);
  await caller.remove_commit({ case_id: 41, item_type: kind, item_id: "7" });
  const removal = mocks.query.mock.calls.at(-1)!;
  expect(removal[1]).toEqual([41, ref, expect.any(Number), 7]);
  expect(removal[0]).toContain("where entry #>> '{}' <> $2");
});

it("rejects an unresolved source before writing any saved identity", async () => {
  mocks.resolve.mockResolvedValueOnce({ status: "unresolved", reason: "No matching formula" });
  const caller = caseStateRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  await expect(caller.commit_source_reference({ case_id: 41, kind: "settlement_formula", source_id: "7" })).rejects.toThrow("No matching formula");
  expect(mocks.query).not.toHaveBeenCalled();
});

it("rejects another owner before resolving or writing a reference", async () => {
  mocks.owner_id = 8;
  const caller = caseStateRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  await expect(caller.commit_source_reference({ case_id: 41, kind: "enforcement", source_id: "7" })).rejects.toThrow("access denied");
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});
